// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildID, GuildScheduledEventID, UserID} from '../BrandedTypes';
import type {GuildScheduledEventRow} from '../database/types/GuildScheduledEventTypes';
import type {GuildScheduledEvent} from '../models/GuildScheduledEvent';

export abstract class IGuildScheduledEventRepository {
	abstract findUnique(eventId: GuildScheduledEventID): Promise<GuildScheduledEvent | null>;

	abstract upsert(data: GuildScheduledEventRow, oldData?: GuildScheduledEventRow | null): Promise<GuildScheduledEvent>;

	abstract delete(eventId: GuildScheduledEventID, guildId: GuildID): Promise<void>;

	abstract listGuildEvents(guildId: GuildID): Promise<Array<GuildScheduledEvent>>;

	abstract addUser(params: {eventId: GuildScheduledEventID; guildId: GuildID; userId: UserID}): Promise<boolean>;

	abstract removeUser(params: {eventId: GuildScheduledEventID; guildId: GuildID; userId: UserID}): Promise<boolean>;

	abstract isUserSubscribed(eventId: GuildScheduledEventID, userId: UserID): Promise<boolean>;

	abstract listEventUserIds(eventId: GuildScheduledEventID): Promise<Array<UserID>>;

	abstract listUserEvents(userId: UserID): Promise<Array<GuildScheduledEvent>>;
}
