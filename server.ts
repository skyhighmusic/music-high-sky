import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type, ThinkingLevel, Modality } from '@google/genai';
import { requireAuth, type AuthenticatedRequest } from './src/middleware/auth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  getOrCreateSqlUser,
  listTourVenues,
  createTourVenue,
  deleteTourVenue,
  listStudioCreations,
  createStudioCreation,
  deleteStudioCreation,
  listChatMessages,
  appendChatMessages,
  clearChatMessages,
} from './src/db/queries.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_CHAT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-4-carbon',
  'gemini-4-neon',
  'gemini-3.1-flash-lite',
]);

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatAiError(error: unknown, fallback: string): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : fallback;
  const lower = raw.toLowerCase();
  if (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('billing') ||
    lower.includes('403') ||
    lower.includes('permission_denied')
  ) {
    return {
      status: 429,
      message:
        'This AI model requires a billing-enabled Gemini API key or available quota. Configure GEMINI_API_KEY in Settings > Secrets to enable full access.',
    };
  }
  return { status: 500, message: raw || fallback };
}

async function tryVerifyOptionalUser(req: express.Request) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      name: decoded.name ?? decoded.email ?? 'Music High Sky Member',
    };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Music High Sky' });
  });

  // =========================================================================
  // EXISTING MARKETING KIT GENERATOR
  // =========================================================================
  app.post('/api/marketing/generate', async (req, res) => {
    try {
      const {
        title,
        subtitle,
        primaryArtist,
        featuredArtist,
        releaseType,
        genre,
        subgenre,
        language,
        mood,
        plannedReleaseDate,
        distributorLabel,
        lyricist,
        composer,
        musicProducer,
        customAngle,
      } = req.body ?? {};

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Release title is required to generate promotional copy.' });
      }

      const ai = createGeminiClient();

      const prompt = `Create a complete, authentic, high-impact music marketing kit for an official release distributed by Music High Sky.

Release Details:
- Title: ${title}${subtitle ? ` (${subtitle})` : ''}
- Release Format: ${releaseType === 'video' ? 'Official Music Video' : 'Official Audio Release'}
- Primary Artist: ${primaryArtist || 'Sunil Kumar'}
- Featured Artist: ${featuredArtist || 'None'}
- Label / Distributor: ${distributorLabel || 'Music High Sky'}
- Genre: ${genre || 'Hindi Music'}${subgenre ? ` / ${subgenre}` : ''}
- Language: ${language || 'Hindi'}
- Mood / Vibe: ${mood || 'Emotional & Cinematic'}
- Planned Release Date: ${plannedReleaseDate || 'Upcoming'}
- Lyricist: ${lyricist || 'Sunil Kumar'}
- Composer: ${composer || 'Sunil Kumar'}
- Music Producer: ${musicProducer || 'Music High Sky Studio'}
- Additional Creative Angle: ${customAngle || 'Official release rollout targeting India and global diaspora listeners across Spotify, Apple Music, YouTube, JioSaavn, and Instagram Reels.'}

Requirements:
- Maintain official credit formatting: Artist: ${primaryArtist || 'Sunil Kumar'} | Label: ${distributorLabel || 'Music High Sky'}.
- Keep tone polished, music-industry native, culturally resonant for Indian & global audiences (include natural Hindi/Haryanvi flavor if language matches, while keeping primary copy crisp and readable).
- Do not fabricate fake award claims or fake stream counts.
- Provide 3 distinct YouTube title options, 1 complete SEO-optimized YouTube description with credit block, 15 high-intent SEO tags, 15 trending hashtags, 2 Instagram caption options, 1 Facebook promotional post, 1 formal release announcement press blurb, and 1 Spotify editorial pitch / promotional copy.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior Indian and global independent music marketing director working for the official label Music High Sky and artist Sunil Kumar. Return only well-structured JSON matching the requested schema.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              youtubeTitles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 optimized YouTube video or official audio titles.',
              },
              youtubeDescription: {
                type: Type.STRING,
                description: 'Complete YouTube description including official credits and calls to action.',
              },
              seoTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '15 comma-ready YouTube and music SEO tags.',
              },
              trendingHashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '15 social media hashtags including # prefix.',
              },
              instagramCaptions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 engaging Instagram / Reels promotional captions.',
              },
              facebookPost: {
                type: Type.STRING,
                description: 'Facebook page promotional post.',
              },
              releaseAnnouncement: {
                type: Type.STRING,
                description: 'Official press / fan release announcement copy.',
              },
              spotifyCopy: {
                type: Type.STRING,
                description: 'Spotify editorial pitch and streaming promotional copy.',
              },
            },
            required: [
              'youtubeTitles',
              'youtubeDescription',
              'seoTags',
              'trendingHashtags',
              'instagramCaptions',
              'facebookPost',
              'releaseAnnouncement',
              'spotifyCopy',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({ error: 'The AI service returned an empty promotional response.' });
      }

      const parsed = JSON.parse(rawText);
      return res.json({ kit: parsed });
    } catch (error: unknown) {
      console.error('Marketing AI generation error:', error);
      const formatted = formatAiError(error, 'Failed to generate promotional kit.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // CLOUD SQL (POSTGRESQL + DRIZZLE) AUTHENTICATED ROUTES
  // =========================================================================
  app.get('/api/sql/venues', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      await getOrCreateSqlUser(user);
      const venues = await listTourVenues(user.uid);
      return res.json({ venues });
    } catch (error) {
      console.error('GET /api/sql/venues error:', error);
      return res.status(500).json({ error: 'Unable to load tour venues right now.' });
    }
  });

  app.post('/api/sql/venues', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const { placeId, name, formattedAddress, category, lat, lng, plannedDate, notes, googleMapsUri } =
        req.body ?? {};
      if (!name || typeof name !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: 'Valid venue name and coordinates are required.' });
      }
      await getOrCreateSqlUser(user);
      const venue = await createTourVenue({
        userId: user.uid,
        placeId: typeof placeId === 'string' ? placeId : undefined,
        name: name.trim(),
        formattedAddress: typeof formattedAddress === 'string' ? formattedAddress.trim() : undefined,
        category: typeof category === 'string' ? category.trim() : 'Recording Studio',
        lat,
        lng,
        plannedDate: typeof plannedDate === 'string' ? plannedDate.trim() : undefined,
        notes: typeof notes === 'string' ? notes.trim() : undefined,
        googleMapsUri: typeof googleMapsUri === 'string' ? googleMapsUri.trim() : undefined,
      });
      return res.status(201).json({ venue });
    } catch (error) {
      console.error('POST /api/sql/venues error:', error);
      return res.status(500).json({ error: 'Unable to save tour venue right now.' });
    }
  });

  app.delete('/api/sql/venues/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const venueId = Number(req.params.id);
      if (!Number.isInteger(venueId) || venueId <= 0) {
        return res.status(400).json({ error: 'Invalid venue identifier.' });
      }
      const deleted = await deleteTourVenue(user.uid, venueId);
      if (!deleted) {
        return res.status(404).json({ error: 'Venue not found.' });
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error('DELETE /api/sql/venues error:', error);
      return res.status(500).json({ error: 'Unable to remove tour venue right now.' });
    }
  });

  app.get('/api/sql/creations', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      await getOrCreateSqlUser(user);
      const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
      const creations = await listStudioCreations(user.uid, kind);
      return res.json({ creations });
    } catch (error) {
      console.error('GET /api/sql/creations error:', error);
      return res.status(500).json({ error: 'Unable to load studio history right now.' });
    }
  });

  app.post('/api/sql/creations', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const { kind, model, title, prompt, outputText, mimeType, metadataJson } = req.body ?? {};
      if (!kind || !model || !title || !prompt) {
        return res.status(400).json({ error: 'Missing required studio creation fields.' });
      }
      await getOrCreateSqlUser(user);
      const creation = await createStudioCreation({
        userId: user.uid,
        kind: String(kind),
        model: String(model),
        title: String(title).slice(0, 180),
        prompt: String(prompt).slice(0, 4000),
        outputText: typeof outputText === 'string' ? outputText.slice(0, 12000) : undefined,
        mimeType: typeof mimeType === 'string' ? mimeType : undefined,
        metadataJson: typeof metadataJson === 'string' ? metadataJson.slice(0, 4000) : undefined,
      });
      return res.status(201).json({ creation });
    } catch (error) {
      console.error('POST /api/sql/creations error:', error);
      return res.status(500).json({ error: 'Unable to save studio record right now.' });
    }
  });

  app.delete('/api/sql/creations/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const creationId = Number(req.params.id);
      if (!Number.isInteger(creationId) || creationId <= 0) {
        return res.status(400).json({ error: 'Invalid record identifier.' });
      }
      const deleted = await deleteStudioCreation(user.uid, creationId);
      if (!deleted) {
        return res.status(404).json({ error: 'Studio record not found.' });
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error('DELETE /api/sql/creations error:', error);
      return res.status(500).json({ error: 'Unable to delete studio record right now.' });
    }
  });

  app.get('/api/sql/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      await getOrCreateSqlUser(user);
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : 'default';
      const messages = await listChatMessages(user.uid, sessionId);
      return res.json({ messages });
    } catch (error) {
      console.error('GET /api/sql/chat error:', error);
      return res.status(500).json({ error: 'Unable to load chat history right now.' });
    }
  });

  app.delete('/api/sql/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : 'default';
      await clearChatMessages(user.uid, sessionId);
      return res.json({ ok: true });
    } catch (error) {
      console.error('DELETE /api/sql/chat error:', error);
      return res.status(500).json({ error: 'Unable to clear chat history right now.' });
    }
  });

  // =========================================================================
  // AI MUSIC GENERATION (LYRIA 3 CLIP & PRO)
  // =========================================================================
  app.post('/api/ai/music', async (req, res) => {
    try {
      const { prompt, mode = 'clip', imageBase64, imageMimeType } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'A musical direction prompt is required.' });
      }

      const model = mode === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
      const ai = createGeminiClient();

      const contents =
        imageBase64 && typeof imageBase64 === 'string'
          ? [
              {
                inlineData: {
                  mimeType: typeof imageMimeType === 'string' ? imageMimeType : 'image/png',
                  data: imageBase64,
                },
              },
              { text: prompt.trim() },
            ]
          : prompt.trim();

      const stream = await ai.models.generateContentStream({
        model,
        contents,
      });

      const audioChunks: Buffer[] = [];
      let mimeType = 'audio/mpeg';
      let lyrics = '';

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            mimeType = part.inlineData.mimeType || mimeType;
            audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
          } else if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioChunks.length === 0) {
        return res.status(502).json({
          error: 'No audio data was returned by Lyria. Try refining your musical prompt.',
        });
      }

      const audioBase64 = Buffer.concat(audioChunks).toString('base64');
      return res.json({
        model,
        mimeType,
        audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
        lyrics: lyrics.trim(),
      });
    } catch (error) {
      console.error('AI Music generation error:', error);
      const formatted = formatAiError(error, 'Failed to generate music track.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // AI IMAGE CREATION & EDITING (GEMINI NANO BANANA 2.1)
  // =========================================================================
  app.post('/api/ai/image', async (req, res) => {
    try {
      const {
        prompt,
        aspectRatio = '1:1',
        imageSize = '1K',
        sourceImageBase64,
        sourceImageMimeType,
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'An artwork or edit prompt is required.' });
      }

      const ai = createGeminiClient();
      const model = 'gemini-nano-banana-2.1';

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (sourceImageBase64 && typeof sourceImageBase64 === 'string') {
        parts.push({
          inlineData: {
            mimeType: typeof sourceImageMimeType === 'string' ? sourceImageMimeType : 'image/png',
            data: sourceImageBase64,
          },
        });
      }
      parts.push({ text: prompt.trim() });

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: String(aspectRatio),
            imageSize: String(imageSize),
          },
        },
      });

      let imageBase64: string | null = null;
      let mimeType = 'image/png';
      let caption = '';

      const responseParts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of responseParts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
        } else if (part.text) {
          caption += part.text;
        }
      }

      if (!imageBase64) {
        return res.status(502).json({
          error: caption.trim() || 'The model did not return an image. Please refine your prompt.',
        });
      }

      return res.json({
        model,
        mimeType,
        imageDataUrl: `data:${mimeType};base64,${imageBase64}`,
        caption: caption.trim(),
      });
    } catch (error) {
      console.error('AI Image generation error:', error);
      const formatted = formatAiError(error, 'Failed to generate artwork.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // AI VIDEO GENERATION: TEXT-TO-VIDEO & IMAGE-TO-VIDEO (GEMINI OMNI 1.2 FLASH)
  // =========================================================================
  app.post('/api/ai/video', async (req, res) => {
    try {
      const {
        prompt,
        aspectRatio = '16:9',
        duration = '5s',
        imageBase64,
        imageMimeType,
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'A video prompt is required.' });
      }

      const validRatio = aspectRatio === '9:16' ? '9:16' : '16:9';
      const validDuration = duration === '10s' ? '10s' : '5s';
      const model = 'gemini-omni-1.2-flash';
      const ai = createGeminiClient();

      const input =
        imageBase64 && typeof imageBase64 === 'string'
          ? [
              {
                type: 'image' as const,
                mime_type: typeof imageMimeType === 'string' ? imageMimeType : 'image/png',
                data: imageBase64,
              },
              {
                type: 'text' as const,
                text: prompt.trim(),
              },
            ]
          : prompt.trim();

      const interaction = await (ai.interactions as unknown as {
        create: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }).create(
        {
          model,
          input,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: validRatio,
            duration: validDuration,
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      let videoBase64: string | null = null;
      let videoMime = 'video/mp4';

      const outputVideo = interaction.output_video as
        | { data?: string; mime_type?: string }
        | undefined;
      if (outputVideo?.data) {
        videoBase64 = outputVideo.data;
        videoMime = outputVideo.mime_type || 'video/mp4';
      } else if (Array.isArray(interaction.outputs)) {
        for (const out of interaction.outputs as Array<Record<string, unknown>>) {
          if (out.type === 'video' && typeof out.data === 'string') {
            videoBase64 = out.data;
            videoMime = typeof out.mime_type === 'string' ? out.mime_type : 'video/mp4';
            break;
          }
        }
      }

      if (!videoBase64) {
        return res.status(502).json({
          error: 'No video payload was returned. Try a clearer visual description.',
        });
      }

      return res.json({
        model,
        mimeType: videoMime,
        videoDataUrl: `data:${videoMime};base64,${videoBase64}`,
        aspectRatio: validRatio,
        duration: validDuration,
      });
    } catch (error) {
      console.error('AI Video generation error:', error);
      const formatted = formatAiError(error, 'Failed to generate video.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // MULTI-TURN LABEL & ARTIST CHATBOT (WITH OPTIONAL GOOGLE SEARCH GROUNDING)
  // =========================================================================
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const {
        messages,
        model: requestedModel = 'gemini-4-hydrogen',
        sessionId = 'default',
        enableWebSearch = false,
      } = req.body ?? {};

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Conversation messages are required.' });
      }

      const useSearch = Boolean(enableWebSearch);
      const model = useSearch
        ? 'gemini-4-hydrogen'
        : ALLOWED_CHAT_MODELS.has(requestedModel)
          ? requestedModel
          : 'gemini-4-hydrogen';

      const ai = createGeminiClient();

      const contents = messages
        .filter(
          (m: unknown): m is { role: 'user' | 'model'; text: string } =>
            Boolean(m) &&
            typeof (m as { text?: unknown }).text === 'string' &&
            ((m as { role?: unknown }).role === 'user' ||
              (m as { role?: unknown }).role === 'model')
        )
        .map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

      if (contents.length === 0) {
        return res.status(400).json({ error: 'At least one valid message is required.' });
      }

      const config: Record<string, unknown> = {
        systemInstruction:
          'You are the Executive A&R, Music Distribution, and Artist Strategy Advisor for Music High Sky, the official label of independent artist Sunil Kumar (Hindi, Haryanvi, Romantic, Emotional, Motivational, Rap & Cinematic music, primary market India with worldwide DSP distribution). Give authoritative, practical, industry-grade advice on release strategy, ISRC/UPC metadata, DSP pitching, royalty auditing, music video rollouts, and songwriting polish. Never fabricate fake streams, awards, or legal guarantees.',
      };

      if (useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      const reply = (response.text ?? '').trim();
      if (!reply) {
        return res.status(502).json({ error: 'Empty response from assistant.' });
      }

      const sources: Array<{ title: string; uri: string }> = [];
      if (useSearch) {
        const candidate = response.candidates?.[0] as Record<string, unknown> | undefined;
        const gm = candidate?.groundingMetadata as
          | { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> }
          | undefined;
        const seen = new Set<string>();
        for (const chunk of gm?.groundingChunks ?? []) {
          const uri = chunk.web?.uri;
          if (uri && !seen.has(uri)) {
            seen.add(uri);
            sources.push({ title: chunk.web?.title || uri, uri });
          }
        }
      }

      // Persist turn to Cloud SQL if authenticated
      const authedUser = await tryVerifyOptionalUser(req);
      if (authedUser) {
        try {
          const lastUserMessage = [...messages]
            .reverse()
            .find((m: { role?: string; text?: string }) => m.role === 'user');
          await getOrCreateSqlUser(authedUser);
          const entriesToSave: { role: 'user' | 'model'; model: string; content: string }[] = [];
          if (lastUserMessage?.text) {
            entriesToSave.push({
              role: 'user',
              model,
              content: String(lastUserMessage.text),
            });
          }
          entriesToSave.push({
            role: 'model',
            model,
            content: reply,
          });
          await appendChatMessages(authedUser.uid, String(sessionId), entriesToSave);
        } catch (dbErr) {
          console.error('Optional chat persistence skipped:', dbErr);
        }
      }

      return res.json({ reply, model, sources });
    } catch (error) {
      console.error('AI Chat error:', error);
      const formatted = formatAiError(error, 'Failed to generate chat response.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // GOOGLE SEARCH GROUNDING (GEMINI 4 HYDROGEN + GOOGLE SEARCH TOOL)
  // =========================================================================
  app.post('/api/ai/search-grounding', async (req, res) => {
    try {
      const { query } = req.body ?? {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'A research query is required.' });
      }

      const ai = createGeminiClient();
      const model = 'gemini-4-hydrogen';

      const response = await ai.models.generateContent({
        model,
        contents: query.trim(),
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction:
            'You are the Real-Time Music Industry Research Analyst for Music High Sky and artist Sunil Kumar. Use Google Search grounding to provide accurate, up-to-date facts on streaming platform policies, Indian & global music charts, music festivals, distribution guidelines, copyright rules, and promotion trends. Be concise, well-structured, and never fabricate unverified figures.',
        },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        return res.status(502).json({ error: 'Search grounding returned an empty response.' });
      }

      const candidate = response.candidates?.[0] as Record<string, unknown> | undefined;
      const groundingMetadata = candidate?.groundingMetadata as
        | {
            webSearchQueries?: string[];
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
          }
        | undefined;

      const sources: Array<{ title: string; uri: string }> = [];
      const seenUris = new Set<string>();
      for (const chunk of groundingMetadata?.groundingChunks ?? []) {
        const uri = chunk.web?.uri;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({
            title: chunk.web?.title || uri,
            uri,
          });
        }
      }

      return res.json({
        model,
        text,
        sources,
        queries: groundingMetadata?.webSearchQueries ?? [],
      });
    } catch (error) {
      console.error('Search Grounding error:', error);
      const formatted = formatAiError(error, 'Failed to query Google Search grounding.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // GOOGLE MAPS GROUNDING (GEMINI 4 HYDROGEN + GOOGLE MAPS TOOL)
  // =========================================================================
  app.post('/api/ai/maps-grounding', async (req, res) => {
    try {
      const { query, lat, lng } = req.body ?? {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'A location or venue query is required.' });
      }

      const ai = createGeminiClient();
      const model = 'gemini-4-hydrogen';

      const config: Record<string, unknown> = {
        tools: [{ googleMaps: {} }],
        systemInstruction:
          'You are a tour & studio location scout for Music High Sky and artist Sunil Kumar. Answer location questions using live Google Maps grounding data with accurate addresses, studio/venue suitability, and helpful practical context.',
      };

      if (typeof lat === 'number' && typeof lng === 'number') {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng,
            },
          },
        };
      }

      const response = await ai.models.generateContent({
        model,
        contents: query.trim(),
        config,
      });

      const text = (response.text ?? '').trim();
      const candidate = response.candidates?.[0] as Record<string, unknown> | undefined;
      const groundingMetadata = candidate?.groundingMetadata as
        | { groundingChunks?: Array<Record<string, unknown>> }
        | undefined;
      const rawChunks = groundingMetadata?.groundingChunks ?? [];

      const places: Array<{
        title: string;
        uri: string;
        placeId?: string;
        reviewSnippets: Array<{ text: string; uri?: string }>;
      }> = [];

      const seenUris = new Set<string>();
      for (const chunk of rawChunks) {
        const maps = chunk.maps as
          | {
              title?: string;
              uri?: string;
              placeId?: string;
              placeAnswerSources?: {
                reviewSnippets?: Array<{
                  uri?: string;
                  title?: string;
                  content?: string;
                  reviewText?: string;
                }>;
              };
            }
          | undefined;

        if (maps?.uri && !seenUris.has(maps.uri)) {
          seenUris.add(maps.uri);
          const snippets = (maps.placeAnswerSources?.reviewSnippets ?? [])
            .map((s) => ({
              text: s.reviewText || s.content || s.title || '',
              uri: s.uri,
            }))
            .filter((s) => Boolean(s.text));

          places.push({
            title: maps.title || 'Google Maps Place',
            uri: maps.uri,
            placeId: maps.placeId,
            reviewSnippets: snippets,
          });
        }
      }

      return res.json({
        model,
        text,
        places,
      });
    } catch (error) {
      console.error('Maps Grounding error:', error);
      const formatted = formatAiError(error, 'Failed to query Google Maps grounding.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // AUDIO TRANSCRIPTION (GEMINI 3.5 TRANSCRIBE)
  // =========================================================================
  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm', prompt } = req.body ?? {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        return res.status(400).json({ error: 'Recorded or uploaded audio data is required.' });
      }

      const ai = createGeminiClient();
      const model = 'gemini-3.5-transcribe';

      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: String(mimeType),
                data: audioBase64,
              },
            },
            {
              text:
                typeof prompt === 'string' && prompt.trim()
                  ? prompt.trim()
                  : 'Generate a clean, accurate transcript of the speech or song lyrics in this audio. Preserve Hindi, Haryanvi, or English wording faithfully and format line breaks naturally.',
            },
          ],
        },
      });

      const transcript = (response.text ?? '').trim();
      if (!transcript) {
        return res.status(502).json({ error: 'No transcript could be extracted from this audio.' });
      }

      return res.json({ model, transcript });
    } catch (error) {
      console.error('Audio transcription error:', error);
      const formatted = formatAiError(error, 'Failed to transcribe audio.');
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // LIVE VOICE CONVERSATIONS WEBSOCKET (GEMINI 3.8 LIVE)
  // =========================================================================
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (reqUrl.startsWith('/api/live-voice')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    let liveSession: {
      sendRealtimeInput: (payload: Record<string, unknown>) => void;
      sendClientContent?: (payload: Record<string, unknown>) => void;
      close: () => void;
    } | null = null;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const ai = createGeminiClient();
      liveSession = (await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'You are the live vocal A&R and studio production partner for Music High Sky and artist Sunil Kumar. Speak warmly, concisely, and naturally like an executive music producer and label strategist helping with song concepts, release timing, DSP pitching, and promotional hooks.',
        },
        callbacks: {
          onopen: () => {
            safeSend({ type: 'ready' });
          },
          onmessage: (message: unknown) => {
            const serverContent = (message as {
              serverContent?: {
                interrupted?: boolean;
                turnComplete?: boolean;
                inputTranscription?: { text?: string };
                outputTranscription?: { text?: string };
                modelTurn?: {
                  parts?: Array<{
                    inlineData?: { data?: string; mimeType?: string };
                    text?: string;
                  }>;
                };
              };
            })?.serverContent;

            if (serverContent?.interrupted) {
              safeSend({ type: 'interrupted' });
            }

            if (serverContent?.inputTranscription?.text) {
              safeSend({
                type: 'inputTranscript',
                text: serverContent.inputTranscription.text,
              });
            }

            if (serverContent?.outputTranscription?.text) {
              safeSend({
                type: 'outputTranscript',
                text: serverContent.outputTranscription.text,
              });
            }

            const parts = serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                safeSend({
                  type: 'audio',
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                });
              }
            }

            if (serverContent?.turnComplete) {
              safeSend({ type: 'turnComplete' });
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live session error:', err);
            const formatted = formatAiError(err, 'Live voice connection encountered an error.');
            safeSend({ type: 'error', message: formatted.message });
          },
          onclose: () => {
            safeSend({ type: 'closed' });
          },
        },
      })) as unknown as typeof liveSession;
    } catch (error) {
      console.error('Failed to initialize Gemini Live session:', error);
      const formatted = formatAiError(error, 'Failed to start Live Voice Studio.');
      safeSend({ type: 'error', message: formatted.message });
      clientWs.close();
      return;
    }

    clientWs.on('message', (rawData) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(String(rawData)) as {
          type: string;
          data?: string;
          text?: string;
        };
        if (msg.type === 'audio' && msg.data) {
          liveSession.sendRealtimeInput({
            media: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && msg.text && liveSession.sendClientContent) {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text }] }],
            turnComplete: true,
          });
        } else if (msg.type === 'close') {
          liveSession.close();
        }
      } catch (err) {
        console.error('Error processing Live WS client frame:', err);
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
      liveSession = null;
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const publicPath = path.resolve(__dirname, 'public');
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(publicPath, { maxAge: '7d' }));
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Music High Sky server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
