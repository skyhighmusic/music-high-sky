import { and, desc, eq, asc } from 'drizzle-orm';
import { sqlDb } from './index.ts';
import {
  sqlUsers,
  tourVenues,
  studioCreations,
  chatMessages,
  type TourVenueRow,
  type StudioCreationRow,
  type ChatMessageRow,
} from './schema.ts';

export async function getOrCreateSqlUser(user: {
  uid: string;
  email: string;
  name: string;
}): Promise<void> {
  try {
    await sqlDb
      .insert(sqlUsers)
      .values({
        id: user.uid,
        email: user.email || `${user.uid}@musichighsky.local`,
        displayName: user.name || 'Music High Sky Member',
      })
      .onConflictDoUpdate({
        target: sqlUsers.id,
        set: {
          email: user.email || `${user.uid}@musichighsky.local`,
          displayName: user.name || 'Music High Sky Member',
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('SQL user upsert failed:', error);
    throw new Error('Unable to synchronize member profile.', { cause: error });
  }
}

export async function listTourVenues(userId: string): Promise<TourVenueRow[]> {
  try {
    return await sqlDb
      .select()
      .from(tourVenues)
      .where(eq(tourVenues.userId, userId))
      .orderBy(desc(tourVenues.createdAt));
  } catch (error) {
    console.error('Failed to list tour venues:', error);
    throw new Error('Unable to load saved tour venues and studios.', { cause: error });
  }
}

export async function createTourVenue(input: {
  userId: string;
  placeId?: string;
  name: string;
  formattedAddress?: string;
  category: string;
  lat: number;
  lng: number;
  plannedDate?: string;
  notes?: string;
  googleMapsUri?: string;
}): Promise<TourVenueRow> {
  try {
    const [created] = await sqlDb
      .insert(tourVenues)
      .values({
        userId: input.userId,
        placeId: input.placeId ?? null,
        name: input.name,
        formattedAddress: input.formattedAddress ?? null,
        category: input.category || 'Recording Studio',
        lat: input.lat,
        lng: input.lng,
        plannedDate: input.plannedDate ?? null,
        notes: input.notes ?? null,
        googleMapsUri: input.googleMapsUri ?? null,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to create tour venue:', error);
    throw new Error('Unable to save tour venue.', { cause: error });
  }
}

export async function deleteTourVenue(userId: string, venueId: number): Promise<boolean> {
  try {
    const deleted = await sqlDb
      .delete(tourVenues)
      .where(and(eq(tourVenues.id, venueId), eq(tourVenues.userId, userId)))
      .returning({ id: tourVenues.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Failed to delete tour venue:', error);
    throw new Error('Unable to remove tour venue.', { cause: error });
  }
}

export async function listStudioCreations(
  userId: string,
  kind?: string
): Promise<StudioCreationRow[]> {
  try {
    const condition = kind
      ? and(eq(studioCreations.userId, userId), eq(studioCreations.kind, kind))
      : eq(studioCreations.userId, userId);

    return await sqlDb
      .select()
      .from(studioCreations)
      .where(condition)
      .orderBy(desc(studioCreations.createdAt))
      .limit(50);
  } catch (error) {
    console.error('Failed to list studio creations:', error);
    throw new Error('Unable to load creative studio log.', { cause: error });
  }
}

export async function createStudioCreation(input: {
  userId: string;
  kind: string;
  model: string;
  title: string;
  prompt: string;
  outputText?: string;
  mimeType?: string;
  metadataJson?: string;
}): Promise<StudioCreationRow> {
  try {
    const [created] = await sqlDb
      .insert(studioCreations)
      .values({
        userId: input.userId,
        kind: input.kind,
        model: input.model,
        title: input.title,
        prompt: input.prompt,
        outputText: input.outputText ?? null,
        mimeType: input.mimeType ?? null,
        metadataJson: input.metadataJson ?? null,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to save studio creation:', error);
    throw new Error('Unable to save studio creation record.', { cause: error });
  }
}

export async function deleteStudioCreation(
  userId: string,
  creationId: number
): Promise<boolean> {
  try {
    const deleted = await sqlDb
      .delete(studioCreations)
      .where(and(eq(studioCreations.id, creationId), eq(studioCreations.userId, userId)))
      .returning({ id: studioCreations.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Failed to delete studio creation:', error);
    throw new Error('Unable to delete studio creation record.', { cause: error });
  }
}

export async function listChatMessages(
  userId: string,
  sessionId = 'default'
): Promise<ChatMessageRow[]> {
  try {
    return await sqlDb
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)))
      .orderBy(asc(chatMessages.createdAt))
      .limit(100);
  } catch (error) {
    console.error('Failed to load chat history:', error);
    throw new Error('Unable to load conversation history.', { cause: error });
  }
}

export async function appendChatMessages(
  userId: string,
  sessionId: string,
  entries: { role: 'user' | 'model'; model: string; content: string }[]
): Promise<ChatMessageRow[]> {
  try {
    if (entries.length === 0) return [];
    return await sqlDb
      .insert(chatMessages)
      .values(
        entries.map((entry) => ({
          userId,
          sessionId,
          role: entry.role,
          model: entry.model,
          content: entry.content,
        }))
      )
      .returning();
  } catch (error) {
    console.error('Failed to save chat messages:', error);
    throw new Error('Unable to persist conversation message.', { cause: error });
  }
}

export async function clearChatMessages(
  userId: string,
  sessionId = 'default'
): Promise<void> {
  try {
    await sqlDb
      .delete(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)));
  } catch (error) {
    console.error('Failed to clear chat messages:', error);
    throw new Error('Unable to clear conversation history.', { cause: error });
  }
}
