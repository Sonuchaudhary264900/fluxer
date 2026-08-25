// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ChannelID, GuildID, GuildScheduledEventID, UserID} from '../../BrandedTypes';

type Nullish<T> = T | null;

export const GuildScheduledEventEntityTypes = {
	VOICE: 1,
	EXTERNAL: 2,
} as const;
export type GuildScheduledEventEntityType =
	(typeof GuildScheduledEventEntityTypes)[keyof typeof GuildScheduledEventEntityTypes];

export const GuildScheduledEventStatuses = {
	SCHEDULED: 1,
	ACTIVE: 2,
	COMPLETED: 3,
	CANCELED: 4,
} as const;
export type GuildScheduledEventStatus = (typeof GuildScheduledEventStatuses)[keyof typeof GuildScheduledEventStatuses];

export interface GuildScheduledEventRow {
	event_id: GuildScheduledEventID;
	guild_id: GuildID;
	channel_id: Nullish<ChannelID>;
	creator_id: UserID;
	name: string;
	description: Nullish<string>;
	entity_type: number;
	external_location: Nullish<string>;
	status: number;
	scheduled_start_time: Date;
	scheduled_end_time: Nullish<Date>;
	user_count: number;
	soft_deleted: boolean;
	version: number;
}

export const GUILD_SCHEDULED_EVENT_COLUMNS = [
	'event_id',
	'guild_id',
	'channel_id',
	'creator_id',
	'name',
	'description',
	'entity_type',
	'external_location',
	'status',
	'scheduled_start_time',
	'scheduled_end_time',
	'user_count',
	'soft_deleted',
	'version',
] as const satisfies ReadonlyArray<keyof GuildScheduledEventRow>;

export interface GuildScheduledEventsByGuildRow {
	guild_id: GuildID;
	event_id: GuildScheduledEventID;
}

export const GUILD_SCHEDULED_EVENTS_BY_GUILD_COLUMNS = [
	'guild_id',
	'event_id',
] as const satisfies ReadonlyArray<keyof GuildScheduledEventsByGuildRow>;

export interface GuildScheduledEventUserRow {
	event_id: GuildScheduledEventID;
	user_id: UserID;
	guild_id: GuildID;
	joined_at: Date;
}

export const GUILD_SCHEDULED_EVENT_USER_COLUMNS = [
	'event_id',
	'user_id',
	'guild_id',
	'joined_at',
] as const satisfies ReadonlyArray<keyof GuildScheduledEventUserRow>;

export interface GuildScheduledEventsByUserRow {
	user_id: UserID;
	event_id: GuildScheduledEventID;
	guild_id: GuildID;
	joined_at: Date;
}

export const GUILD_SCHEDULED_EVENTS_BY_USER_COLUMNS = [
	'user_id',
	'event_id',
	'guild_id',
	'joined_at',
] as const satisfies ReadonlyArray<keyof GuildScheduledEventsByUserRow>;
