// SPDX-License-Identifier: AGPL-3.0-or-later

import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {GuildScheduledEventResponse} from '@fluxer/schema/src/domains/guild_scheduled_event/GuildScheduledEventSchemas';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {createTestAccount} from '../../auth/tests/AuthTestUtils';
import {
	acceptInvite,
	addMemberRole,
	createChannelInvite,
	createGuild,
	createRole,
	getChannel,
	getGuild,
} from '../../guild/tests/GuildTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '../../test/ApiTestHarness';
import {HTTP_STATUS} from '../../test/TestConstants';
import {createBuilder} from '../../test/TestRequestBuilder';

const EVENT_ENTITY_TYPE_VOICE = 1;
const EVENT_ENTITY_TYPE_EXTERNAL = 2;

function inFuture(minutes: number): string {
	return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function createEvent(
	harness: ApiTestHarness,
	token: string,
	guildId: string,
	overrides: Record<string, unknown> = {},
): Promise<GuildScheduledEventResponse> {
	return createBuilder<GuildScheduledEventResponse>(harness, token)
		.post(`/guilds/${guildId}/scheduled-events`)
		.body({
			name: 'Test Event',
			entity_type: EVENT_ENTITY_TYPE_EXTERNAL,
			external_location: 'Somewhere fun',
			scheduled_start_time: inFuture(60),
			scheduled_end_time: inFuture(120),
			...overrides,
		})
		.execute();
}

async function grantEventPermissions(
	harness: ApiTestHarness,
	ownerToken: string,
	guildId: string,
	userId: string,
	permissions: bigint,
): Promise<void> {
	const role = await createRole(harness, ownerToken, guildId, {
		name: 'Event Manager',
		permissions: permissions.toString(),
	});
	await addMemberRole(harness, ownerToken, guildId, userId, role.id);
}

async function joinGuild(harness: ApiTestHarness, ownerToken: string, guildId: string, memberToken: string): Promise<void> {
	const guild = await getGuild(harness, ownerToken, guildId);
	const systemChannel = await getChannel(harness, ownerToken, guild.system_channel_id!);
	const invite = await createChannelInvite(harness, ownerToken, systemChannel.id);
	await acceptInvite(harness, memberToken, invite.code);
}

describe('Guild Scheduled Events', () => {
	let harness: ApiTestHarness;
	beforeEach(async () => {
		harness = await createApiTestHarness();
	});
	afterEach(async () => {
		await harness?.shutdown();
	});

	describe('Create', () => {
		test('should allow a member with create_events to create an external event', async () => {
			const owner = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			const event = await createEvent(harness, owner.token, guild.id);
			expect(event.name).toBe('Test Event');
			expect(event.entity_type).toBe(EVENT_ENTITY_TYPE_EXTERNAL);
			expect(event.status).toBe(1);
			expect(event.user_count).toBe(0);
			expect(event.me).toBe(false);
		});
		test('should reject a member without create_events', async () => {
			const owner = await createTestAccount(harness);
			const member = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await joinGuild(harness, owner.token, guild.id, member.token);
			await createBuilder(harness, member.token)
				.post(`/guilds/${guild.id}/scheduled-events`)
				.body({
					name: 'Test Event',
					entity_type: EVENT_ENTITY_TYPE_EXTERNAL,
					external_location: 'Somewhere fun',
					scheduled_start_time: inFuture(60),
					scheduled_end_time: inFuture(120),
				})
				.expect(HTTP_STATUS.FORBIDDEN)
				.execute();
		});
		test('should require channel_id for voice events', async () => {
			const owner = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await createBuilder(harness, owner.token)
				.post(`/guilds/${guild.id}/scheduled-events`)
				.body({
					name: 'Test Event',
					entity_type: EVENT_ENTITY_TYPE_VOICE,
					scheduled_start_time: inFuture(60),
				})
				.expect(HTTP_STATUS.BAD_REQUEST)
				.execute();
		});
		test('should require external_location and end time for external events', async () => {
			const owner = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await createBuilder(harness, owner.token)
				.post(`/guilds/${guild.id}/scheduled-events`)
				.body({
					name: 'Test Event',
					entity_type: EVENT_ENTITY_TYPE_EXTERNAL,
					scheduled_start_time: inFuture(60),
				})
				.expect(HTTP_STATUS.BAD_REQUEST)
				.execute();
		});
		test('should reject a start time in the past', async () => {
			const owner = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await createBuilder(harness, owner.token)
				.post(`/guilds/${guild.id}/scheduled-events`)
				.body({
					name: 'Test Event',
					entity_type: EVENT_ENTITY_TYPE_EXTERNAL,
					external_location: 'Somewhere fun',
					scheduled_start_time: inFuture(-60),
					scheduled_end_time: inFuture(60),
				})
				.expect(HTTP_STATUS.BAD_REQUEST)
				.execute();
		});
	});

	describe('Update and delete', () => {
		test('should allow the creator to update their own event without manage_events', async () => {
			const owner = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			const event = await createEvent(harness, owner.token, guild.id);
			const updated = await createBuilder<GuildScheduledEventResponse>(harness, owner.token)
				.patch(`/guilds/${guild.id}/scheduled-events/${event.id}`)
				.body({name: 'Renamed Event'})
				.execute();
			expect(updated.name).toBe('Renamed Event');
		});
		test('should reject a non-creator without manage_events from updating', async () => {
			const owner = await createTestAccount(harness);
			const member = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await joinGuild(harness, owner.token, guild.id, member.token);
			await grantEventPermissions(harness, owner.token, guild.id, member.userId, Permissions.VIEW_CHANNEL);
			const event = await createEvent(harness, owner.token, guild.id);
			await createBuilder(harness, member.token)
				.patch(`/guilds/${guild.id}/scheduled-events/${event.id}`)
				.body({name: 'Renamed Event'})
				.expect(HTTP_STATUS.FORBIDDEN)
				.execute();
		});
		test('should allow a member with manage_events to update an event they did not create', async () => {
			const owner = await createTestAccount(harness);
			const moderator = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await joinGuild(harness, owner.token, guild.id, moderator.token);
			await grantEventPermissions(
				harness,
				owner.token,
				guild.id,
				moderator.userId,
				Permissions.VIEW_CHANNEL | Permissions.MANAGE_EVENTS,
			);
			const event = await createEvent(harness, owner.token, guild.id);
			const updated = await createBuilder<GuildScheduledEventResponse>(harness, moderator.token)
				.patch(`/guilds/${guild.id}/scheduled-events/${event.id}`)
				.body({name: 'Moderated Event'})
				.execute();
			expect(updated.name).toBe('Moderated Event');
		});
		test('should allow the creator to delete their own event', async () => {
			const owner = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			const event = await createEvent(harness, owner.token, guild.id);
			await createBuilder(harness, owner.token)
				.delete(`/guilds/${guild.id}/scheduled-events/${event.id}`)
				.expect(HTTP_STATUS.NO_CONTENT)
				.execute();
			await createBuilder(harness, owner.token)
				.get(`/guilds/${guild.id}/scheduled-events/${event.id}`)
				.expect(HTTP_STATUS.NOT_FOUND)
				.execute();
		});
	});

	describe('Subscriptions', () => {
		test('should let a member subscribe and unsubscribe, updating user_count and me', async () => {
			const owner = await createTestAccount(harness);
			const member = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await joinGuild(harness, owner.token, guild.id, member.token);
			const event = await createEvent(harness, owner.token, guild.id);
			const subscribed = await createBuilder<GuildScheduledEventResponse>(harness, member.token)
				.put(`/guilds/${guild.id}/scheduled-events/${event.id}/users/@me`)
				.execute();
			expect(subscribed.me).toBe(true);
			expect(subscribed.user_count).toBe(1);
			const mine = await createBuilder<Array<GuildScheduledEventResponse>>(harness, member.token)
				.get('/users/@me/scheduled-events')
				.execute();
			expect(mine.some((e) => e.id === event.id)).toBe(true);
			const unsubscribed = await createBuilder<GuildScheduledEventResponse>(harness, member.token)
				.delete(`/guilds/${guild.id}/scheduled-events/${event.id}/users/@me`)
				.execute();
			expect(unsubscribed.me).toBe(false);
			expect(unsubscribed.user_count).toBe(0);
		});
		test('should list subscribers via the event users endpoint', async () => {
			const owner = await createTestAccount(harness);
			const member = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'Test Guild');
			await joinGuild(harness, owner.token, guild.id, member.token);
			const event = await createEvent(harness, owner.token, guild.id);
			await createBuilder(harness, member.token).put(`/guilds/${guild.id}/scheduled-events/${event.id}/users/@me`).execute();
			const subscribers = await createBuilder<Array<{user_id: string}>>(harness, owner.token)
				.get(`/guilds/${guild.id}/scheduled-events/${event.id}/users`)
				.execute();
			expect(subscribers.map((s) => s.user_id)).toContain(member.userId);
		});
	});
});
