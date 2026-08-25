// SPDX-License-Identifier: AGPL-3.0-or-later

import {GuildIdEventIdParam, GuildIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	GuildScheduledEventCreateRequest,
	GuildScheduledEventUpdateRequest,
} from '@fluxer/schema/src/domains/guild_scheduled_event/GuildScheduledEventRequestSchemas';
import {
	GuildScheduledEventResponse,
	GuildScheduledEventUserResponse,
} from '@fluxer/schema/src/domains/guild_scheduled_event/GuildScheduledEventSchemas';
import {z} from 'zod';
import {createGuildID, createGuildScheduledEventID} from '../BrandedTypes';
import {LoginRequired} from '../middleware/AuthMiddleware';
import {RateLimitMiddleware} from '../middleware/RateLimitMiddleware';
import {OpenAPI} from '../middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '../RateLimitConfig';
import type {HonoApp} from '../types/HonoEnv';
import {Validator} from '../Validator';

export function GuildScheduledEventController(app: HonoApp) {
	app.get(
		'/guilds/:guild_id/scheduled-events',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_LIST),
		LoginRequired,
		Validator('param', GuildIdParam),
		OpenAPI({
			operationId: 'list_guild_scheduled_events',
			summary: 'List guild scheduled events',
			responseSchema: z.array(GuildScheduledEventResponse),
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description: 'List scheduled events for a guild, ordered by start time.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			return ctx.json(await ctx.get('guildService').scheduledEvents.listGuildEvents({userId, guildId}));
		},
	);
	app.post(
		'/guilds/:guild_id/scheduled-events',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_CREATE),
		LoginRequired,
		Validator('param', GuildIdParam),
		Validator('json', GuildScheduledEventCreateRequest),
		OpenAPI({
			operationId: 'create_guild_scheduled_event',
			summary: 'Create guild scheduled event',
			responseSchema: GuildScheduledEventResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description: 'Create a scheduled event in a guild. Requires the create_events permission.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const data = ctx.req.valid('json');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(
				await ctx.get('guildService').scheduledEvents.createEvent({userId, guildId, data}, auditLogReason),
			);
		},
	);
	app.get(
		'/guilds/:guild_id/scheduled-events/:event_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_GET),
		LoginRequired,
		Validator('param', GuildIdEventIdParam),
		OpenAPI({
			operationId: 'get_guild_scheduled_event',
			summary: 'Get guild scheduled event',
			responseSchema: GuildScheduledEventResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description: 'Get a single scheduled event by ID.',
		}),
		async (ctx) => {
			const {guild_id, event_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const eventId = createGuildScheduledEventID(event_id);
			return ctx.json(await ctx.get('guildService').scheduledEvents.getEvent({userId, guildId, eventId}));
		},
	);
	app.patch(
		'/guilds/:guild_id/scheduled-events/:event_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_UPDATE),
		LoginRequired,
		Validator('param', GuildIdEventIdParam),
		Validator('json', GuildScheduledEventUpdateRequest),
		OpenAPI({
			operationId: 'update_guild_scheduled_event',
			summary: 'Update guild scheduled event',
			responseSchema: GuildScheduledEventResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description:
				'Update a scheduled event. Allowed for the event creator, or users with the manage_events permission.',
		}),
		async (ctx) => {
			const {guild_id, event_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const eventId = createGuildScheduledEventID(event_id);
			const data = ctx.req.valid('json');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(
				await ctx
					.get('guildService')
					.scheduledEvents.updateEvent({userId, guildId, eventId, data}, auditLogReason),
			);
		},
	);
	app.delete(
		'/guilds/:guild_id/scheduled-events/:event_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_DELETE),
		LoginRequired,
		Validator('param', GuildIdEventIdParam),
		OpenAPI({
			operationId: 'delete_guild_scheduled_event',
			summary: 'Delete guild scheduled event',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description:
				'Delete a scheduled event. Allowed for the event creator, or users with the manage_events permission.',
		}),
		async (ctx) => {
			const {guild_id, event_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const eventId = createGuildScheduledEventID(event_id);
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			await ctx.get('guildService').scheduledEvents.deleteEvent({userId, guildId, eventId}, auditLogReason);
			return ctx.body(null, 204);
		},
	);
	app.get(
		'/guilds/:guild_id/scheduled-events/:event_id/users',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_USERS_LIST),
		LoginRequired,
		Validator('param', GuildIdEventIdParam),
		OpenAPI({
			operationId: 'list_guild_scheduled_event_users',
			summary: 'List guild scheduled event subscribers',
			responseSchema: z.array(GuildScheduledEventUserResponse),
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description: 'List the users subscribed to a scheduled event.',
		}),
		async (ctx) => {
			const {guild_id, event_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const eventId = createGuildScheduledEventID(event_id);
			return ctx.json(await ctx.get('guildService').scheduledEvents.listEventUsers({userId, guildId, eventId}));
		},
	);
	app.put(
		'/guilds/:guild_id/scheduled-events/:event_id/users/@me',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_SUBSCRIBE),
		LoginRequired,
		Validator('param', GuildIdEventIdParam),
		OpenAPI({
			operationId: 'subscribe_to_guild_scheduled_event',
			summary: 'Subscribe to guild scheduled event',
			responseSchema: GuildScheduledEventResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description: 'Mark the current user as going to a scheduled event.',
		}),
		async (ctx) => {
			const {guild_id, event_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const eventId = createGuildScheduledEventID(event_id);
			return ctx.json(await ctx.get('guildService').scheduledEvents.subscribe({userId, guildId, eventId}));
		},
	);
	app.delete(
		'/guilds/:guild_id/scheduled-events/:event_id/users/@me',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SCHEDULED_EVENT_UNSUBSCRIBE),
		LoginRequired,
		Validator('param', GuildIdEventIdParam),
		OpenAPI({
			operationId: 'unsubscribe_from_guild_scheduled_event',
			summary: 'Unsubscribe from guild scheduled event',
			responseSchema: GuildScheduledEventResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
			description: 'Remove the current user from a scheduled event.',
		}),
		async (ctx) => {
			const {guild_id, event_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const eventId = createGuildScheduledEventID(event_id);
			return ctx.json(await ctx.get('guildService').scheduledEvents.unsubscribe({userId, guildId, eventId}));
		},
	);
	app.get(
		'/users/@me/scheduled-events',
		RateLimitMiddleware(RateLimitConfigs.USER_SCHEDULED_EVENTS_LIST),
		LoginRequired,
		OpenAPI({
			operationId: 'list_my_scheduled_events',
			summary: 'List my scheduled events',
			responseSchema: z.array(GuildScheduledEventResponse),
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Users'],
			description:
				"List the scheduled events the current user is subscribed to across every guild, for the personal calendar view.",
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			return ctx.json(await ctx.get('guildService').scheduledEvents.listUserEvents(userId));
		},
	);
}
