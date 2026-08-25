// SPDX-License-Identifier: AGPL-3.0-or-later

import {AuditLogActionType} from '@fluxer/constants/src/AuditLogActionType';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {ValidationErrorCodes} from '@fluxer/constants/src/ValidationErrorCodes';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {MissingPermissionsError} from '@fluxer/errors/src/domains/core/MissingPermissionsError';
import {UnknownGuildScheduledEventError} from '@fluxer/errors/src/domains/guild/UnknownGuildScheduledEventError';
import type {
	GuildScheduledEventCreateRequest,
	GuildScheduledEventUpdateRequest,
} from '@fluxer/schema/src/domains/guild_scheduled_event/GuildScheduledEventRequestSchemas';
import type {
	GuildScheduledEventResponse,
	GuildScheduledEventUserResponse,
} from '@fluxer/schema/src/domains/guild_scheduled_event/GuildScheduledEventSchemas';
import type {GuildID, GuildScheduledEventID, UserID} from '../BrandedTypes';
import {createChannelID, createGuildScheduledEventID} from '../BrandedTypes';
import {GuildScheduledEventEntityTypes, GuildScheduledEventStatuses} from '../database/types/GuildScheduledEventTypes';
import type {GuildAuditLogService} from '../guild/GuildAuditLogService';
import type {GuildAuditLogChange} from '../guild/GuildAuditLogTypes';
import type {IGatewayService} from '../infrastructure/IGatewayService';
import type {ISnowflakeService} from '../infrastructure/ISnowflakeService';
import {Logger} from '../Logger';
import type {GuildScheduledEvent} from '../models/GuildScheduledEvent';
import type {IGuildScheduledEventRepository} from './IGuildScheduledEventRepository';

interface GuildAuth {
	checkPermission: (permission: bigint) => Promise<void>;
	hasPermission: (permission: bigint) => Promise<boolean>;
}

export class GuildScheduledEventService {
	constructor(
		private readonly repository: IGuildScheduledEventRepository,
		private readonly snowflakeService: ISnowflakeService,
		private readonly gatewayService: IGatewayService,
		private readonly guildAuditLogService: GuildAuditLogService,
	) {}

	async createEvent(
		params: {userId: UserID; guildId: GuildID; data: GuildScheduledEventCreateRequest},
		auditLogReason?: string | null,
	): Promise<GuildScheduledEventResponse> {
		const {userId, guildId, data} = params;
		const {checkPermission} = await this.getGuildAuthenticated({userId, guildId});
		await checkPermission(Permissions.CREATE_EVENTS);
		this.validateEntityFields({
			entityType: data.entity_type,
			channelId: data.channel_id,
			externalLocation: data.external_location,
			scheduledEndTime: data.scheduled_end_time,
		});
		const scheduledStartTime = new Date(data.scheduled_start_time);
		const scheduledEndTime = data.scheduled_end_time ? new Date(data.scheduled_end_time) : null;
		this.validateEventTimes({scheduledStartTime, scheduledEndTime, isNewEvent: true});
		const eventId = createGuildScheduledEventID(await this.snowflakeService.generate());
		const channelId = data.channel_id !== undefined ? createChannelID(data.channel_id) : null;
		const event = await this.repository.upsert({
			event_id: eventId,
			guild_id: guildId,
			channel_id: channelId,
			creator_id: userId,
			name: data.name,
			description: data.description ?? null,
			entity_type: data.entity_type,
			external_location: data.external_location ?? null,
			status: GuildScheduledEventStatuses.SCHEDULED,
			scheduled_start_time: scheduledStartTime,
			scheduled_end_time: scheduledEndTime,
			user_count: 0,
			soft_deleted: false,
			version: 1,
		});
		await this.dispatch({guildId, event: 'GUILD_SCHEDULED_EVENT_CREATE', data: this.toResponse(event, false)});
		await this.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.GUILD_SCHEDULED_EVENT_CREATE,
			targetId: event.id,
			auditLogReason: auditLogReason ?? null,
			changes: this.guildAuditLogService.computeChanges(null, this.serializeForAudit(event)),
		});
		return this.toResponse(event, false);
	}

	async updateEvent(
		params: {userId: UserID; guildId: GuildID; eventId: GuildScheduledEventID; data: GuildScheduledEventUpdateRequest},
		auditLogReason?: string | null,
	): Promise<GuildScheduledEventResponse> {
		const {userId, guildId, eventId, data} = params;
		const event = await this.getGuildEventOrThrow(eventId, guildId);
		await this.checkCanManageEvent({userId, guildId, event});
		if (event.status === GuildScheduledEventStatuses.COMPLETED || event.status === GuildScheduledEventStatuses.CANCELED) {
			throw InputValidationError.fromCode('status', ValidationErrorCodes.EVENT_ALREADY_COMPLETED_OR_CANCELED);
		}
		const entityType = data.entity_type ?? event.entityType;
		const channelId =
			data.channel_id !== undefined ? (data.channel_id === null ? null : createChannelID(data.channel_id)) : event.channelId;
		const externalLocation = data.external_location !== undefined ? data.external_location : event.externalLocation;
		const scheduledEndTime = data.scheduled_end_time !== undefined
			? (data.scheduled_end_time ? new Date(data.scheduled_end_time) : null)
			: event.scheduledEndTime;
		this.validateEntityFields({
			entityType,
			channelId: channelId ?? undefined,
			externalLocation: externalLocation ?? undefined,
			scheduledEndTime: scheduledEndTime ? scheduledEndTime.toISOString() : undefined,
		});
		const scheduledStartTime = data.scheduled_start_time ? new Date(data.scheduled_start_time) : event.scheduledStartTime;
		this.validateEventTimes({scheduledStartTime, scheduledEndTime, isNewEvent: false});
		const previousSnapshot = this.serializeForAudit(event);
		const status = this.resolveStatusUpdate(event.status, data.status);
		const updatedRow = {
			...event.toRow(),
			name: data.name ?? event.name,
			description: data.description !== undefined ? data.description : event.description,
			channel_id: channelId,
			entity_type: entityType,
			external_location: externalLocation,
			scheduled_start_time: scheduledStartTime,
			scheduled_end_time: scheduledEndTime,
			status,
		};
		const updatedEvent = await this.repository.upsert(updatedRow, event.toRow());
		const me = await this.repository.isUserSubscribed(eventId, userId);
		await this.dispatch({guildId, event: 'GUILD_SCHEDULED_EVENT_UPDATE', data: this.toResponse(updatedEvent, me)});
		await this.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.GUILD_SCHEDULED_EVENT_UPDATE,
			targetId: eventId,
			auditLogReason: auditLogReason ?? null,
			changes: this.guildAuditLogService.computeChanges(previousSnapshot, this.serializeForAudit(updatedEvent)),
		});
		return this.toResponse(updatedEvent, me);
	}

	async deleteEvent(
		params: {userId: UserID; guildId: GuildID; eventId: GuildScheduledEventID},
		auditLogReason?: string | null,
	): Promise<void> {
		const {userId, guildId, eventId} = params;
		const event = await this.getGuildEventOrThrow(eventId, guildId);
		await this.checkCanManageEvent({userId, guildId, event});
		const previousSnapshot = this.serializeForAudit(event);
		await this.repository.delete(eventId, guildId);
		await this.dispatch({guildId, event: 'GUILD_SCHEDULED_EVENT_DELETE', data: this.toResponse(event, false)});
		await this.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.GUILD_SCHEDULED_EVENT_DELETE,
			targetId: eventId,
			auditLogReason: auditLogReason ?? null,
			changes: this.guildAuditLogService.computeChanges(previousSnapshot, null),
		});
	}

	async getEvent(params: {userId: UserID; guildId: GuildID; eventId: GuildScheduledEventID}): Promise<GuildScheduledEventResponse> {
		const {userId, guildId, eventId} = params;
		await this.getGuildAuthenticated({userId, guildId});
		const event = await this.getGuildEventOrThrow(eventId, guildId);
		const me = await this.repository.isUserSubscribed(eventId, userId);
		return this.toResponse(event, me);
	}

	async listGuildEvents(params: {userId: UserID; guildId: GuildID}): Promise<Array<GuildScheduledEventResponse>> {
		const {userId, guildId} = params;
		await this.getGuildAuthenticated({userId, guildId});
		const events = await this.repository.listGuildEvents(guildId);
		const sorted = [...events].sort((a, b) => a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime());
		return Promise.all(
			sorted.map(async (event) => this.toResponse(event, await this.repository.isUserSubscribed(event.id, userId))),
		);
	}

	async listUserEvents(userId: UserID): Promise<Array<GuildScheduledEventResponse>> {
		const events = await this.repository.listUserEvents(userId);
		const sorted = [...events].sort((a, b) => a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime());
		return sorted.map((event) => this.toResponse(event, true));
	}

	async listEventUsers(params: {
		userId: UserID;
		guildId: GuildID;
		eventId: GuildScheduledEventID;
	}): Promise<Array<GuildScheduledEventUserResponse>> {
		const {userId, guildId, eventId} = params;
		await this.getGuildAuthenticated({userId, guildId});
		await this.getGuildEventOrThrow(eventId, guildId);
		const userIds = await this.repository.listEventUserIds(eventId);
		return userIds.map((subscriberId) => ({
			user_id: subscriberId.toString(),
			joined_at: new Date().toISOString(),
		}));
	}

	async subscribe(params: {userId: UserID; guildId: GuildID; eventId: GuildScheduledEventID}): Promise<GuildScheduledEventResponse> {
		const {userId, guildId, eventId} = params;
		await this.getGuildAuthenticated({userId, guildId});
		const event = await this.getGuildEventOrThrow(eventId, guildId);
		if (event.status === GuildScheduledEventStatuses.COMPLETED || event.status === GuildScheduledEventStatuses.CANCELED) {
			throw InputValidationError.fromCode('status', ValidationErrorCodes.EVENT_ALREADY_COMPLETED_OR_CANCELED);
		}
		const added = await this.repository.addUser({eventId, guildId, userId});
		const refreshed = added ? ((await this.repository.findUnique(eventId)) ?? event) : event;
		if (added) {
			await this.dispatch({
				guildId,
				event: 'GUILD_SCHEDULED_EVENT_USER_ADD',
				data: {guild_scheduled_event_id: eventId.toString(), guild_id: guildId.toString(), user_id: userId.toString()},
			});
		}
		return this.toResponse(refreshed, true);
	}

	async unsubscribe(params: {userId: UserID; guildId: GuildID; eventId: GuildScheduledEventID}): Promise<GuildScheduledEventResponse> {
		const {userId, guildId, eventId} = params;
		await this.getGuildAuthenticated({userId, guildId});
		const event = await this.getGuildEventOrThrow(eventId, guildId);
		const removed = await this.repository.removeUser({eventId, guildId, userId});
		const refreshed = removed ? ((await this.repository.findUnique(eventId)) ?? event) : event;
		if (removed) {
			await this.dispatch({
				guildId,
				event: 'GUILD_SCHEDULED_EVENT_USER_REMOVE',
				data: {guild_scheduled_event_id: eventId.toString(), guild_id: guildId.toString(), user_id: userId.toString()},
			});
		}
		return this.toResponse(refreshed, false);
	}

	private resolveStatusUpdate(currentStatus: number, requestedStatus: number | undefined): number {
		if (requestedStatus === undefined) return currentStatus;
		if (requestedStatus !== GuildScheduledEventStatuses.ACTIVE && requestedStatus !== GuildScheduledEventStatuses.CANCELED) {
			throw InputValidationError.fromCode('status', ValidationErrorCodes.EVENT_ALREADY_COMPLETED_OR_CANCELED);
		}
		return requestedStatus;
	}

	private validateEntityFields(params: {
		entityType: number;
		channelId: bigint | undefined;
		externalLocation: string | undefined;
		scheduledEndTime: string | undefined;
	}): void {
		const {entityType, channelId, externalLocation, scheduledEndTime} = params;
		if (entityType === GuildScheduledEventEntityTypes.VOICE) {
			if (channelId === undefined || channelId === null) {
				throw InputValidationError.fromCode('channel_id', ValidationErrorCodes.EVENT_CHANNEL_ID_REQUIRED_FOR_VOICE_EVENTS);
			}
			return;
		}
		if (entityType === GuildScheduledEventEntityTypes.EXTERNAL) {
			if (!externalLocation) {
				throw InputValidationError.fromCode(
					'external_location',
					ValidationErrorCodes.EVENT_EXTERNAL_LOCATION_REQUIRED_FOR_EXTERNAL_EVENTS,
				);
			}
			if (!scheduledEndTime) {
				throw InputValidationError.fromCode(
					'scheduled_end_time',
					ValidationErrorCodes.EVENT_END_TIME_REQUIRED_FOR_EXTERNAL_EVENTS,
				);
			}
			return;
		}
		throw InputValidationError.fromCode('entity_type', ValidationErrorCodes.INVALID_INTEGER_FORMAT);
	}

	private validateEventTimes(params: {scheduledStartTime: Date; scheduledEndTime: Date | null; isNewEvent: boolean}): void {
		const {scheduledStartTime, scheduledEndTime, isNewEvent} = params;
		if (isNewEvent && scheduledStartTime.getTime() <= Date.now()) {
			throw InputValidationError.fromCode('scheduled_start_time', ValidationErrorCodes.EVENT_START_TIME_MUST_BE_IN_FUTURE);
		}
		if (scheduledEndTime && scheduledEndTime.getTime() <= scheduledStartTime.getTime()) {
			throw InputValidationError.fromCode('scheduled_end_time', ValidationErrorCodes.EVENT_END_TIME_MUST_BE_AFTER_START_TIME);
		}
	}

	private async checkCanManageEvent(params: {userId: UserID; guildId: GuildID; event: GuildScheduledEvent}): Promise<void> {
		const {userId, guildId, event} = params;
		if (event.creatorId === userId) return;
		const {hasPermission} = await this.getGuildAuthenticated({userId, guildId});
		if (!(await hasPermission(Permissions.MANAGE_EVENTS))) {
			throw new MissingPermissionsError();
		}
	}

	private async getGuildEventOrThrow(eventId: GuildScheduledEventID, guildId: GuildID): Promise<GuildScheduledEvent> {
		const event = await this.repository.findUnique(eventId);
		if (!event || event.guildId !== guildId) {
			throw new UnknownGuildScheduledEventError();
		}
		return event;
	}

	private async getGuildAuthenticated(params: {userId: UserID; guildId: GuildID}): Promise<GuildAuth> {
		const {userId, guildId} = params;
		await this.gatewayService.getGuildData({guildId, userId});
		const checkPermission = async (permission: bigint) => {
			const allowed = await this.gatewayService.checkPermission({guildId, userId, permission});
			if (!allowed) throw new MissingPermissionsError();
		};
		const hasPermission = async (permission: bigint) =>
			this.gatewayService.checkPermission({guildId, userId, permission});
		return {checkPermission, hasPermission};
	}

	private toResponse(event: GuildScheduledEvent, me: boolean): GuildScheduledEventResponse {
		return {
			id: event.id.toString(),
			guild_id: event.guildId.toString(),
			channel_id: event.channelId?.toString() ?? null,
			creator_id: event.creatorId.toString(),
			name: event.name,
			description: event.description,
			entity_type: event.entityType,
			external_location: event.externalLocation,
			status: event.status,
			scheduled_start_time: event.scheduledStartTime.toISOString(),
			scheduled_end_time: event.scheduledEndTime?.toISOString() ?? null,
			user_count: event.userCount,
			me,
		};
	}

	private serializeForAudit(event: GuildScheduledEvent): Record<string, unknown> {
		return {
			event_id: event.id.toString(),
			name: event.name,
			description: event.description ?? null,
			channel_id: event.channelId?.toString() ?? null,
			entity_type: event.entityType,
			external_location: event.externalLocation ?? null,
			status: event.status,
			scheduled_start_time: event.scheduledStartTime.toISOString(),
			scheduled_end_time: event.scheduledEndTime?.toISOString() ?? null,
		};
	}

	private async dispatch(params: {guildId: GuildID; event: 'GUILD_SCHEDULED_EVENT_CREATE' | 'GUILD_SCHEDULED_EVENT_UPDATE' | 'GUILD_SCHEDULED_EVENT_DELETE' | 'GUILD_SCHEDULED_EVENT_USER_ADD' | 'GUILD_SCHEDULED_EVENT_USER_REMOVE'; data: unknown}): Promise<void> {
		await this.gatewayService.dispatchGuild(params);
	}

	private async recordAuditLog(params: {
		guildId: GuildID;
		userId: UserID;
		action: AuditLogActionType;
		targetId: GuildScheduledEventID;
		auditLogReason?: string | null;
		changes?: GuildAuditLogChange | null;
	}): Promise<void> {
		try {
			const builder = this.guildAuditLogService
				.createBuilder(params.guildId, params.userId)
				.withAction(params.action, params.targetId.toString())
				.withReason(params.auditLogReason ?? null);
			if (params.changes) {
				builder.withChanges(params.changes);
			}
			await builder.commit();
		} catch (error) {
			Logger.error(
				{
					error,
					guildId: params.guildId.toString(),
					userId: params.userId.toString(),
					action: params.action,
					targetId: params.targetId.toString(),
				},
				'Failed to record guild scheduled event audit log',
			);
		}
	}
}
