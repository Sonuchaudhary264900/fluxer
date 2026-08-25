// SPDX-License-Identifier: AGPL-3.0-or-later

import {Int32Type, SnowflakeStringType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

export const GuildScheduledEventResponse = z.object({
	id: SnowflakeStringType.describe('The unique identifier for this scheduled event'),
	guild_id: SnowflakeStringType.describe('The ID of the guild this event belongs to'),
	channel_id: SnowflakeStringType.nullish().describe('The ID of the channel this event is hosted in, if any'),
	creator_id: SnowflakeStringType.describe('The ID of the user who created this event'),
	name: z.string().describe('The name of the event'),
	description: z.string().nullish().describe('The description of the event'),
	entity_type: Int32Type.describe('fluxer:Int32Type 1 = voice channel, 2 = external location'),
	external_location: z.string().nullish().describe('The external location of the event, if entity_type is external'),
	status: Int32Type.describe('fluxer:Int32Type 1 = scheduled, 2 = active, 3 = completed, 4 = canceled'),
	scheduled_start_time: z.iso.datetime().describe('ISO8601 timestamp of when the event starts'),
	scheduled_end_time: z.iso.datetime().nullish().describe('ISO8601 timestamp of when the event ends'),
	user_count: Int32Type.describe('fluxer:Int32Type The number of users subscribed to this event'),
	me: z.boolean().describe('Whether the current user is subscribed to this event'),
});

export type GuildScheduledEventResponse = z.infer<typeof GuildScheduledEventResponse>;

export const GuildScheduledEventUserResponse = z.object({
	user_id: SnowflakeStringType.describe('The ID of the subscribed user'),
	joined_at: z.iso.datetime().describe('ISO8601 timestamp of when the user subscribed to this event'),
});

export type GuildScheduledEventUserResponse = z.infer<typeof GuildScheduledEventUserResponse>;
