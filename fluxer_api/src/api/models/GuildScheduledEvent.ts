// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ChannelID, GuildID, GuildScheduledEventID, UserID} from '../BrandedTypes';
import type {GuildScheduledEventRow} from '../database/types/GuildScheduledEventTypes';

export class GuildScheduledEvent {
	readonly id: GuildScheduledEventID;
	readonly guildId: GuildID;
	readonly channelId: ChannelID | null;
	readonly creatorId: UserID;
	readonly name: string;
	readonly description: string | null;
	readonly entityType: number;
	readonly externalLocation: string | null;
	readonly status: number;
	readonly scheduledStartTime: Date;
	readonly scheduledEndTime: Date | null;
	readonly userCount: number;
	readonly version: number;

	constructor(row: GuildScheduledEventRow) {
		this.id = row.event_id;
		this.guildId = row.guild_id;
		this.channelId = row.channel_id ?? null;
		this.creatorId = row.creator_id;
		this.name = row.name;
		this.description = row.description ?? null;
		this.entityType = row.entity_type;
		this.externalLocation = row.external_location ?? null;
		this.status = row.status;
		this.scheduledStartTime = row.scheduled_start_time;
		this.scheduledEndTime = row.scheduled_end_time ?? null;
		this.userCount = row.user_count ?? 0;
		this.version = row.version;
	}

	toRow(): GuildScheduledEventRow {
		return {
			event_id: this.id,
			guild_id: this.guildId,
			channel_id: this.channelId,
			creator_id: this.creatorId,
			name: this.name,
			description: this.description,
			entity_type: this.entityType,
			external_location: this.externalLocation,
			status: this.status,
			scheduled_start_time: this.scheduledStartTime,
			scheduled_end_time: this.scheduledEndTime,
			user_count: this.userCount,
			soft_deleted: false,
			version: this.version,
		};
	}
}
