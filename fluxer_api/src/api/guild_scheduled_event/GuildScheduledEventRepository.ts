// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildID, GuildScheduledEventID, UserID} from '../BrandedTypes';
import {BatchBuilder, fetchMany, fetchManyInChunks, fetchOne, upsertOne} from '../database/CassandraQueryExecution';
import {Db} from '../database/CassandraTypes';
import {buildPatchFromData, executeVersionedUpdate} from '../database/CassandraVersionedUpdate';
import type {GuildScheduledEventRow, GuildScheduledEventUserRow} from '../database/types/GuildScheduledEventTypes';
import {GUILD_SCHEDULED_EVENT_COLUMNS} from '../database/types/GuildScheduledEventTypes';
import {GuildScheduledEvent} from '../models/GuildScheduledEvent';
import {
	GuildScheduledEvents,
	GuildScheduledEventsByGuild,
	GuildScheduledEventsByUser,
	GuildScheduledEventUsers,
} from '../Tables';
import {IGuildScheduledEventRepository} from './IGuildScheduledEventRepository';

const FETCH_EVENT_BY_ID = GuildScheduledEvents.select({
	where: [GuildScheduledEvents.where.eq('event_id'), GuildScheduledEvents.where.eq('soft_deleted')],
	limit: 1,
});
const FETCH_EVENTS_BY_IDS = GuildScheduledEvents.select({
	where: [GuildScheduledEvents.where.in('event_id', 'event_ids'), GuildScheduledEvents.where.eq('soft_deleted')],
});
const FETCH_GUILD_EVENT_IDS = GuildScheduledEventsByGuild.select({
	where: GuildScheduledEventsByGuild.where.eq('guild_id'),
});
const FETCH_USER_EVENT_ROWS = GuildScheduledEventsByUser.select({
	where: GuildScheduledEventsByUser.where.eq('user_id'),
});
const FETCH_EVENT_USER = GuildScheduledEventUsers.select({
	where: [GuildScheduledEventUsers.where.eq('event_id'), GuildScheduledEventUsers.where.eq('user_id')],
	limit: 1,
});
const FETCH_EVENT_USER_IDS = GuildScheduledEventUsers.select({
	columns: ['user_id'],
	where: GuildScheduledEventUsers.where.eq('event_id'),
});

export class GuildScheduledEventRepository extends IGuildScheduledEventRepository {
	async findUnique(eventId: GuildScheduledEventID): Promise<GuildScheduledEvent | null> {
		const row = await fetchOne<GuildScheduledEventRow>(
			FETCH_EVENT_BY_ID.bind({event_id: eventId, soft_deleted: false}),
		);
		return row ? new GuildScheduledEvent(row) : null;
	}

	async upsert(
		data: GuildScheduledEventRow,
		oldData?: GuildScheduledEventRow | null,
	): Promise<GuildScheduledEvent> {
		const eventId = data.event_id;
		const result = await executeVersionedUpdate<GuildScheduledEventRow, 'event_id' | 'soft_deleted'>(
			async () =>
				fetchOne<GuildScheduledEventRow>(FETCH_EVENT_BY_ID.bind({event_id: eventId, soft_deleted: false})),
			(current) => ({
				pk: {event_id: eventId, soft_deleted: false},
				patch: buildPatchFromData(data, current, GUILD_SCHEDULED_EVENT_COLUMNS, ['event_id', 'soft_deleted']),
			}),
			GuildScheduledEvents,
			{initialData: oldData},
		);
		if (!oldData) {
			await upsertOne(
				GuildScheduledEventsByGuild.upsertAll({
					guild_id: data.guild_id,
					event_id: eventId,
				}),
			);
		}
		return new GuildScheduledEvent({...data, version: result.finalVersion ?? 0});
	}

	async delete(eventId: GuildScheduledEventID, guildId: GuildID): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(GuildScheduledEvents.deleteByPk({event_id: eventId, soft_deleted: false}));
		batch.addPrepared(GuildScheduledEventsByGuild.deleteByPk({guild_id: guildId, event_id: eventId}));
		await batch.execute();
	}

	async listGuildEvents(guildId: GuildID): Promise<Array<GuildScheduledEvent>> {
		const indexRows = await fetchMany<{event_id: bigint}>(FETCH_GUILD_EVENT_IDS.bind({guild_id: guildId}));
		if (indexRows.length === 0) return [];
		const eventIds = indexRows.map((row) => row.event_id);
		const rows = await fetchManyInChunks<GuildScheduledEventRow>(FETCH_EVENTS_BY_IDS, eventIds, (chunk) => ({
			event_ids: chunk,
			soft_deleted: false,
		}));
		return rows.map((row) => new GuildScheduledEvent(row));
	}

	async addUser(params: {eventId: GuildScheduledEventID; guildId: GuildID; userId: UserID}): Promise<boolean> {
		const {eventId, guildId, userId} = params;
		const alreadySubscribed = await this.isUserSubscribed(eventId, userId);
		if (alreadySubscribed) return false;
		const joinedAt = new Date();
		const batch = new BatchBuilder();
		batch.addPrepared(
			GuildScheduledEventUsers.upsertAll({
				event_id: eventId,
				user_id: userId,
				guild_id: guildId,
				joined_at: joinedAt,
			} satisfies GuildScheduledEventUserRow),
		);
		batch.addPrepared(
			GuildScheduledEventsByUser.upsertAll({
				user_id: userId,
				event_id: eventId,
				guild_id: guildId,
				joined_at: joinedAt,
			}),
		);
		await batch.execute();
		await this.adjustUserCount(eventId, 1);
		return true;
	}

	async removeUser(params: {eventId: GuildScheduledEventID; guildId: GuildID; userId: UserID}): Promise<boolean> {
		const {eventId, userId} = params;
		const wasSubscribed = await this.isUserSubscribed(eventId, userId);
		if (!wasSubscribed) return false;
		const batch = new BatchBuilder();
		batch.addPrepared(GuildScheduledEventUsers.deleteByPk({event_id: eventId, user_id: userId}));
		batch.addPrepared(GuildScheduledEventsByUser.deleteByPk({user_id: userId, event_id: eventId}));
		await batch.execute();
		await this.adjustUserCount(eventId, -1);
		return true;
	}

	async isUserSubscribed(eventId: GuildScheduledEventID, userId: UserID): Promise<boolean> {
		const row = await fetchOne<{event_id: bigint}>(FETCH_EVENT_USER.bind({event_id: eventId, user_id: userId}));
		return row !== null;
	}

	async listEventUserIds(eventId: GuildScheduledEventID): Promise<Array<UserID>> {
		const rows = await fetchMany<{user_id: UserID}>(FETCH_EVENT_USER_IDS.bind({event_id: eventId}));
		return rows.map((row) => row.user_id);
	}

	async listUserEvents(userId: UserID): Promise<Array<GuildScheduledEvent>> {
		const indexRows = await fetchMany<{event_id: bigint}>(FETCH_USER_EVENT_ROWS.bind({user_id: userId}));
		if (indexRows.length === 0) return [];
		const eventIds = indexRows.map((row) => row.event_id);
		const rows = await fetchManyInChunks<GuildScheduledEventRow>(FETCH_EVENTS_BY_IDS, eventIds, (chunk) => ({
			event_ids: chunk,
			soft_deleted: false,
		}));
		return rows.map((row) => new GuildScheduledEvent(row));
	}

	private async adjustUserCount(eventId: GuildScheduledEventID, delta: number): Promise<void> {
		const current = await fetchOne<GuildScheduledEventRow>(
			FETCH_EVENT_BY_ID.bind({event_id: eventId, soft_deleted: false}),
		);
		if (!current) return;
		const nextCount = Math.max(0, (current.user_count ?? 0) + delta);
		await upsertOne(
			GuildScheduledEvents.patchByPk({event_id: eventId, soft_deleted: false}, {user_count: Db.set(nextCount)}),
		);
	}
}
