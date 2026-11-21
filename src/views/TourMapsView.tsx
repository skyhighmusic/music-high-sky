import React, { useCallback, useEffect, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import {
  Search,
  MapPin,
  Compass,
  ExternalLink,
  BookmarkPlus,
  Trash2,
  Loader2,
  Navigation,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { apiFetchJson } from '../utils/apiClient';

interface DiscoveredPlace {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  rating?: number | null;
  googleMapsUri?: string | null;
}

interface SavedTourVenue {
  id: number;
  placeId?: string | null;
  name: string;
  formattedAddress?: string | null;
  category: string;
  lat: number;
  lng: number;
  plannedDate?: string | null;
  notes?: string | null;
  googleMapsUri?: string | null;
}

interface GroundedPlaceLink {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{ text: string; uri?: string }>;
}

const DEFAULT_INDIA_CENTER = { lat: 28.6139, lng: 77.209 }; // New Delhi, India (primary market)

interface MarkerPinItemProps {
  position: { lat: number; lng: number };
  title: string;
  subtitle?: string;
  variant: 'saved' | 'search';
  rating?: number | null;
  googleMapsUri?: string | null;
  onSave?: () => void;
  saving?: boolean;
}

const MarkerPinItem: React.FC<MarkerPinItemProps> = ({
  position,
  title,
  subtitle,
  variant,
  rating,
  googleMapsUri,
  onSave,
  saving,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        title={title}
        onClick={() => setOpen(true)}
      >
        <Pin
          background={variant === 'saved' ? '#D4AF37' : '#00A8FF'}
          borderColor={variant === 'saved' ? '#F5D58A' : '#00D5FF'}
          glyphColor="#020817"
          scale={variant === 'saved' ? 1.15 : 1.0}
        />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} maxWidth={260}>
          <div className="text-[#020817] space-y-1.5 p-0.5">
            <p className="font-bold text-xs leading-snug">{title}</p>
            {subtitle && <p className="text-[11px] text-slate-600 leading-snug">{subtitle}</p>}
            {typeof rating === 'number' && (
              <p className="text-[11px] font-semibold text-amber-700">Rating: {rating.toFixed(1)} / 5</p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onSave && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onSave}
                  className="px-2.5 py-1 rounded bg-[#020817] text-[#F5D58A] text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save to Itinerary'}
                </button>
              )}
              {googleMapsUri && (
                <a
                  href={googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-blue-700 underline"
                >
                  Open in Google Maps
                </a>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface InteractiveMapCanvasProps {
  searchResults: DiscoveredPlace[];
  savedVenues: SavedTourVenue[];
  focusTarget: { lat: number; lng: number; zoom?: number } | null;
  onSearchResults: (results: DiscoveredPlace[]) => void;
  searchTrigger: { query: string; nonce: number } | null;
  onSavePlace: (place: DiscoveredPlace) => void;
  savingPlaceId: string | null;
  onSearchBusyChange: (busy: boolean) => void;
  onSearchError: (msg: string) => void;
}

const InteractiveMapCanvas: React.FC<InteractiveMapCanvasProps> = ({
  searchResults,
  savedVenues,
  focusTarget,
  onSearchResults,
  searchTrigger,
  onSavePlace,
  savingPlaceId,
  onSearchBusyChange,
  onSearchError,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const coreLib = useMapsLibrary('core');
  const loadingStatus = useApiLoadingStatus();

  useEffect(() => {
    if (map && focusTarget) {
      map.panTo({ lat: focusTarget.lat, lng: focusTarget.lng });
      if (focusTarget.zoom) {
        map.setZoom(focusTarget.zoom);
      }
    }
  }, [map, focusTarget]);

  useEffect(() => {
    if (!searchTrigger || !searchTrigger.query.trim()) return;
    if (!placesLib) {
      onSearchError('Maps Places library is still initializing. Please retry in a moment.');
      return;
    }

    let cancelled = false;
    const runSearch = async () => {
      onSearchBusyChange(true);
      try {
        const PlaceClass = placesLib.Place as unknown as {
          searchByText: (req: Record<string, unknown>) => Promise<{
            places?: Array<{
              id?: string;
              displayName?: string;
              formattedAddress?: string;
              location?: { lat: () => number; lng: () => number };
              rating?: number | null;
              googleMapsURI?: string | null;
            }>;
          }>;
        };

        const center = map?.getCenter();
        const request: Record<string, unknown> = {
          textQuery: searchTrigger.query.trim(),
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'googleMapsURI'],
          maxResultCount: 10,
        };
        if (center) {
          request.locationBias = { lat: center.lat(), lng: center.lng() };
        }

        const { places } = await PlaceClass.searchByText(request);
        if (cancelled) return;

        const mapped: DiscoveredPlace[] = (places ?? [])
          .filter((p) => Boolean(p.location))
          .map((p, idx) => ({
            placeId: p.id || `place-${idx}`,
            name: p.displayName || 'Unnamed Venue',
            formattedAddress: p.formattedAddress || '',
            lat: p.location!.lat(),
            lng: p.location!.lng(),
            rating: p.rating ?? null,
            googleMapsUri: p.googleMapsURI ?? null,
          }));

        onSearchResults(mapped);

        if (mapped.length > 0 && map && coreLib) {
          const bounds = new coreLib.LatLngBounds();
          mapped.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
          map.fitBounds(bounds, 60);
        }
      } catch (err) {
        if (!cancelled) {
          onSearchError(
            err instanceof Error
              ? err.message
              : 'Places search failed. Please refine your query.'
          );
        }
      } finally {
        if (!cancelled) onSearchBusyChange(false);
      }
    };

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [
    searchTrigger,
    placesLib,
    coreLib,
    map,
    onSearchResults,
    onSearchBusyChange,
    onSearchError,
  ]);

  if (
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="h-[460px] lg:h-[520px] w-full rounded-xl bg-[#030509] border border-amber-500/35 flex flex-col items-center justify-center p-6 text-center space-y-2">
        <MapPin className="w-8 h-8 text-amber-400" />
        <p className="text-sm font-semibold text-white">Interactive Google Map Unavailable</p>
        <p className="text-xs text-[#C8D0DB] max-w-md">
          Check that your Google Maps Platform API key is active and within quota. You can still use Maps Grounding search below.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[460px] lg:h-[520px] w-full rounded-xl overflow-hidden border border-[#D4AF37]/30 bg-[#030509]">
      <GoogleMap
        defaultCenter={DEFAULT_INDIA_CENTER}
        defaultZoom={5}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        {savedVenues.map((venue) => (
          <MarkerPinItem
            key={`saved-${venue.id}`}
            position={{ lat: venue.lat, lng: venue.lng }}
            title={venue.name}
            subtitle={`${venue.category}${venue.formattedAddress ? ` · ${venue.formattedAddress}` : ''}`}
            variant="saved"
            googleMapsUri={venue.googleMapsUri}
          />
        ))}
        {searchResults.map((place) => (
          <MarkerPinItem
            key={`search-${place.placeId}`}
            position={{ lat: place.lat, lng: place.lng }}
            title={place.name}
            subtitle={place.formattedAddress}
            variant="search"
            rating={place.rating}
            googleMapsUri={place.googleMapsUri}
            saving={savingPlaceId === place.placeId}
            onSave={() => onSavePlace(place)}
          />
        ))}
      </GoogleMap>
    </div>
  );
};

export const TourMapsView: React.FC = () => {
  const { pushToast } = usePlatform();
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Places Search State
  const [searchQuery, setSearchQuery] = useState('Recording studios in Mumbai, India');
  const [searchTrigger, setSearchTrigger] = useState<{ query: string; nonce: number } | null>(null);
  const [searchResults, setSearchResults] = useState<DiscoveredPlace[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(
    null
  );

  // Saved Tour Venues (PostgreSQL)
  const [savedVenues, setSavedVenues] = useState<SavedTourVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);
  const [saveCategory, setSaveCategory] = useState('Recording Studio');
  const [saveDate, setSaveDate] = useState('');

  // Maps Grounding (Gemini 4 Hydrogen + Google Maps tool)
  const [groundingQuery, setGroundingQuery] = useState(
    'Recommend top acoustic recording studios and live concert auditoriums in Mumbai and Delhi NCR suitable for an independent Hindi & Haryanvi artist showcase.'
  );
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [groundingBusy, setGroundingBusy] = useState(false);
  const [groundingResult, setGroundingResult] = useState<{
    text: string;
    places: GroundedPlaceLink[];
  } | null>(null);

  const loadSavedVenues = useCallback(async () => {
    setVenuesLoading(true);
    try {
      const data = await apiFetchJson<{ venues: SavedTourVenue[] }>('/api/sql/venues');
      setSavedVenues(data.venues ?? []);
    } catch {
      // Gracefully keep empty if unauthenticated
    } finally {
      setVenuesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedVenues();
  }, [loadSavedVenues]);

  const handleSavePlace = async (place: DiscoveredPlace) => {
    setSavingPlaceId(place.placeId);
    try {
      const res = await apiFetchJson<{ venue: SavedTourVenue }>('/api/sql/venues', {
        method: 'POST',
        body: {
          placeId: place.placeId,
          name: place.name,
          formattedAddress: place.formattedAddress,
          category: saveCategory,
          lat: place.lat,
          lng: place.lng,
          plannedDate: saveDate || undefined,
          googleMapsUri: place.googleMapsUri || undefined,
        },
      });
      setSavedVenues((prev) => [res.venue, ...prev]);
      pushToast(`Saved "${place.name}" to Sunil Kumar's tour directory.`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save venue.', 'error');
    } finally {
      setSavingPlaceId(null);
    }
  };

  const handleDeleteVenue = async (venueId: number) => {
    try {
      await apiFetchJson(`/api/sql/venues/${venueId}`, { method: 'DELETE' });
      setSavedVenues((prev) => prev.filter((v) => v.id !== venueId));
      pushToast('Removed venue from tour itinerary.', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to remove venue.', 'error');
    }
  };

  const requestUserLocation = () => {
    if (!navigator.geolocation) {
      pushToast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setUseMyLocation(true);
        setFocusTarget({ ...coords, zoom: 12 });
        pushToast('Current location anchored for nearby studio & venue discovery.', 'success');
      },
      () => {
        pushToast('Location permission was not granted.', 'info');
        setUseMyLocation(false);
      }
    );
  };

  const handleMapsGrounding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groundingQuery.trim()) return;
    setGroundingBusy(true);
    setGroundingResult(null);
    try {
      const res = await apiFetchJson<{
        text: string;
        places: GroundedPlaceLink[];
      }>('/api/ai/maps-grounding', {
        method: 'POST',
        body: {
          query: groundingQuery,
          lat: useMyLocation && userCoords ? userCoords.lat : undefined,
          lng: useMyLocation && userCoords ? userCoords.lng : undefined,
        },
      });
      setGroundingResult({ text: res.text, places: res.places ?? [] });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Maps grounding lookup failed.', 'error');
    } finally {
      setGroundingBusy(false);
    }
  };

  const triggerPlacesSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchTrigger({ query: searchQuery.trim(), nonce: Date.now() });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#00D5FF]">
            Music High Sky · Touring &amp; Studio Network
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient mt-1">
            Live Tour, Studios &amp; Venues Map
          </h1>
          <p className="text-sm text-[#C8D0DB] mt-1 max-w-2xl">
            Discover real recording studios, mastering rooms, concert venues, and media hubs via Google Maps Platform and build Sunil Kumar’s tour itinerary.
          </p>
        </div>

        <button
          type="button"
          onClick={requestUserLocation}
          className="btn-electric inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5" />
          {useMyLocation ? 'Location Anchored' : 'Use My Location'}
        </button>
      </div>

      {/* Places Search Controls */}
      <form
        onSubmit={triggerPlacesSearch}
        className="luxury-card rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end"
      >
        <div className="lg:col-span-5 space-y-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
            Search Real Places (Google Maps Places)
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-[#8D9AAA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., Recording studios in Chandigarh, Music venues in Delhi..."
              className="w-full rounded-xl luxury-input pl-10 pr-3.5 py-2.5 text-sm"
            />
          </div>
        </div>
        <div className="lg:col-span-3 space-y-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
            Save Tag
          </label>
          <select
            value={saveCategory}
            onChange={(e) => setSaveCategory(e.target.value)}
            className="w-full rounded-xl luxury-input px-3 py-2.5 text-sm"
          >
            <option value="Recording Studio">Recording Studio</option>
            <option value="Live Concert Venue">Live Concert Venue</option>
            <option value="Music Video Location">Music Video Location</option>
            <option value="Press & Radio Station">Press &amp; Radio Station</option>
          </select>
        </div>
        <div className="lg:col-span-2 space-y-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
            Target Date
          </label>
          <input
            type="date"
            value={saveDate}
            onChange={(e) => setSaveDate(e.target.value)}
            className="w-full rounded-xl luxury-input px-3 py-2.5 text-sm"
          />
        </div>
        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={searchBusy || !mapsApiKey}
            className="btn-gold w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs uppercase tracking-[0.12em] cursor-pointer disabled:opacity-50"
          >
            {searchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
            Search
          </button>
        </div>
      </form>

      {/* Map + Saved Venues Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-4">
          {mapsApiKey ? (
            <APIProvider
              apiKey={mapsApiKey}
              libraries={['places', 'marker']}
              language="en"
              region="IN"
            >
              <InteractiveMapCanvas
                searchResults={searchResults}
                savedVenues={savedVenues}
                focusTarget={focusTarget}
                onSearchResults={setSearchResults}
                searchTrigger={searchTrigger}
                onSavePlace={handleSavePlace}
                savingPlaceId={savingPlaceId}
                onSearchBusyChange={setSearchBusy}
                onSearchError={(msg) => pushToast(msg, 'error')}
              />
            </APIProvider>
          ) : (
            <div className="h-[460px] w-full rounded-xl bg-[#030509] border border-[#D4AF37]/30 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <MapPin className="w-8 h-8 text-[#F5D58A]" />
              <p className="text-sm font-semibold text-white">Google Maps Key Pending</p>
              <p className="text-xs text-[#8D9AAA] max-w-md">
                Configure VITE_GOOGLE_MAPS_API_KEY in environment secrets to enable live interactive map rendering.
              </p>
            </div>
          )}

          {/* Live Places Results Strip */}
          {searchResults.length > 0 && (
            <div className="luxury-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#00D5FF]">
                  Discovered Places ({searchResults.length})
                </p>
                <p className="text-[11px] text-[#8D9AAA]">
                  Electric Blue Pins · Click a place to pan or save
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                {searchResults.map((place) => (
                  <div
                    key={place.placeId}
                    className="rounded-xl bg-[#030509]/85 border border-[#00A8FF]/25 p-3.5 flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setFocusTarget({ lat: place.lat, lng: place.lng, zoom: 15 })
                        }
                        className="text-left text-xs font-semibold text-white hover:text-[#00D5FF] transition-colors cursor-pointer"
                      >
                        {place.name}
                      </button>
                      {place.formattedAddress && (
                        <p className="text-[11px] text-[#8D9AAA] mt-0.5 line-clamp-2">
                          {place.formattedAddress}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {place.googleMapsUri ? (
                        <a
                          href={place.googleMapsUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#00D5FF] hover:underline"
                        >
                          Maps <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        disabled={savingPlaceId === place.placeId}
                        onClick={() => void handleSavePlace(place)}
                        className="btn-gold inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] cursor-pointer disabled:opacity-50"
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Saved Tour Itinerary Directory (PostgreSQL) */}
        <aside className="xl:col-span-4 luxury-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#F5D58A]">
                Saved Tour &amp; Studio Roster
              </h2>
              <p className="text-xs text-[#8D9AAA]">Gold pins pinned on your label map</p>
            </div>
            <span className="text-xs font-mono text-[#F5D58A] tabular-nums">
              {savedVenues.length} stops
            </span>
          </div>

          <div className="gold-divider" />

          {venuesLoading ? (
            <div className="py-10 flex items-center justify-center text-xs text-[#8D9AAA] gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#00D5FF]" />
              Loading saved itinerary...
            </div>
          ) : savedVenues.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <p className="text-xs font-semibold text-[#C8D0DB]">No saved stops yet</p>
              <p className="text-[11px] text-[#8D9AAA] leading-relaxed">
                Search for recording studios, auditoriums, or video locations above and save them to build Sunil Kumar’s official itinerary.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {savedVenues.map((venue) => (
                <div
                  key={venue.id}
                  className="rounded-xl bg-[#030509]/85 border border-[#D4AF37]/25 p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFocusTarget({ lat: venue.lat, lng: venue.lng, zoom: 15 })
                      }
                      className="text-left min-w-0 cursor-pointer group"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F5D58A]">
                        {venue.category}
                      </span>
                      <p className="text-xs font-semibold text-white group-hover:text-[#F5D58A] truncate mt-0.5">
                        {venue.name}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteVenue(venue.id)}
                      aria-label="Remove venue"
                      className="p-1 text-[#8D9AAA] hover:text-rose-300 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {venue.formattedAddress && (
                    <p className="text-[11px] text-[#8D9AAA] leading-snug">
                      {venue.formattedAddress}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                    {venue.plannedDate ? (
                      <span className="inline-flex items-center gap-1 text-[#C8D0DB]">
                        <Calendar className="w-3 h-3 text-[#F5D58A]" />
                        {venue.plannedDate}
                      </span>
                    ) : (
                      <span className="text-[#8D9AAA]">Date TBD</span>
                    )}
                    {venue.googleMapsUri && (
                      <a
                        href={venue.googleMapsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#00D5FF] hover:underline"
                      >
                        Google Maps <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* ================= GOOGLE MAPS GROUNDING SCOUT ================= */}
      <section className="luxury-card rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#00D5FF]">
              Live Google Maps Grounding
            </p>
            <h2 className="font-display text-lg font-bold text-[#F5D58A] mt-0.5">
              AI Location &amp; Venue Intelligence Scout
            </h2>
            <p className="text-xs text-[#8D9AAA] mt-0.5">
              Ask natural-language scouting questions backed by real-time Google Maps place data and direct verified links.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-[#C8D0DB] cursor-pointer">
            <input
              type="checkbox"
              checked={useMyLocation}
              onChange={(e) => {
                if (e.target.checked && !userCoords) {
                  requestUserLocation();
                } else {
                  setUseMyLocation(e.target.checked);
                }
              }}
              className="accent-[#00A8FF]"
            />
            Bias answers near my location
          </label>
        </div>

        <form onSubmit={handleMapsGrounding} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={groundingQuery}
            onChange={(e) => setGroundingQuery(e.target.value)}
            placeholder="Ask about studios, concert halls, video shoot venues, or logistics near any city..."
            className="flex-1 rounded-xl luxury-input px-4 py-3 text-sm"
          />
          <button
            type="submit"
            disabled={groundingBusy || !groundingQuery.trim()}
            className="btn-gold inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs uppercase tracking-[0.12em] shrink-0 cursor-pointer disabled:opacity-50"
          >
            {groundingBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scouting Maps...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Ask Maps Scout
              </>
            )}
          </button>
        </form>

        {groundingResult && (
          <div className="space-y-4 pt-1">
            <div className="rounded-xl bg-[#030509]/90 border border-[#D4AF37]/25 p-5 text-sm text-[#E8EDF5] whitespace-pre-wrap leading-relaxed">
              {groundingResult.text}
            </div>

            {groundingResult.places.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#00D5FF]">
                  Verified Google Maps Sources ({groundingResult.places.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groundingResult.places.map((p, idx) => (
                    <div
                      key={`${p.uri}-${idx}`}
                      className="rounded-xl bg-[#030509]/85 border border-[#00A8FF]/25 p-3.5 space-y-2"
                    >
                      <a
                        href={p.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5D58A] hover:text-[#00D5FF] transition-colors"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{p.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {p.reviewSnippets.length > 0 && (
                        <div className="space-y-1">
                          {p.reviewSnippets.slice(0, 2).map((snip, sIdx) => (
                            <p
                              key={sIdx}
                              className="text-[11px] text-[#C8D0DB] italic line-clamp-2 leading-snug"
                            >
                              “{snip.text}”
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
