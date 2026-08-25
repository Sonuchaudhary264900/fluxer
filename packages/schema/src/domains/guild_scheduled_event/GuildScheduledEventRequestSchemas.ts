// SPDX-License-Identifier: AGPL-3.0-or-later

import {createStringType, Int32Type, SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

export const GuildScheduledEventCreateRequest = z.object({
	name: createStringType(1, 100).describe('The name of the event (1-100 characters)'),
	description: createStringType(0, 1000).optional().describe('The description of the event (0-1000 characters)'),
	channel_id: SnowflakeType.optional().describe(
		'fluxer:SnowflakeType The ID of the voice channel this event is hosted in (required when entity_type is 1)',
	),
	entity_type: Int32Type.describe('fluxer:Int32Type 1 = voice channel, 2 = external location'),
	external_location: createStringType(1, 100)
		.optional()
		.describe('The external location of the event (required when entity_type is 2)'),
	scheduled_start_time: z.iso.datetime().describe('ISO8601 timestamp of when the event starts'),
	scheduled_end_time: z.iso
		.datetime()
		.optional()
		.describe('ISO8601 timestamp of when the event ends (required when entity_type is 2)'),
});

export type GuildScheduledEventCreateRequest = z.infer<typeof GuildScheduledEventCreateRequest>;

export const GuildScheduledEventUpdateRequest = z.object({
	name: createStringType(1, 100).optional().describe('The name of the event (1-100 characters)'),
	description: createStringType(0, 1000).nullish().describe('The description of the event (0-1000 characters)'),
	channel_id: SnowflakeType.nullish().describe('fluxer:SnowflakeType The ID of the voice channel this event is hosted in'),
	entity_type: Int32Type.optional().describe('fluxer:Int32Type 1 = voice channel, 2 = external location'),
	external_location: createStringType(1, 100).nullish().describe('The external location of the event'),
	scheduled_start_time: z.iso.datetime().optional().describe('ISO8601 timestamp of when the event starts'),
	scheduled_end_time: z.iso.datetime().nullish().describe('ISO8601 timestamp of when the event ends'),
	status: Int32Type.optional().describe(
		'fluxer:Int32Type 1 = scheduled, 2 = active, 3 = completed, 4 = canceled. Can only be set to 2 (active) or 4 (canceled) directly.',
	),
});

export type GuildScheduledEventUpdateRequest = z.infer<typeof GuildScheduledEventUpdateRequest>;
