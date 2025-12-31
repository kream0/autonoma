# Yeli VTC - Requirements Specification

## Executive Summary

Build a ride-hailing mobile application for West Africa (Senegal, Ivory Coast, Mauritania) with voice-first design, offline resilience, and local payment integration. The platform must support customers booking rides, drivers managing trips, and administrators monitoring the system.

---

## Tech Stack

### Frontend (Mobile)
| Component | Technology |
|-----------|------------|
| Framework | Expo SDK 53, React Native 0.76 |
| Language | TypeScript (strict mode) |
| Navigation | react-navigation (stacks + tabs) |
| Maps | react-native-maps (Google Maps) |
| Location | expo-location |
| Voice TTS | expo-speech |
| Voice STT | @react-native-voice/voice |
| Icons | lucide-react-native |
| State | React Context + useReducer |

### Backend
| Component | Technology |
|-----------|------------|
| Platform | Firebase (project: `yeli-vtc`) |
| Auth | Firebase Auth (email/password + phone OTP) |
| Database | Firestore |
| Functions | Cloud Functions (Node.js, Express) |
| Push | Firebase Cloud Messaging (FCM) |
| Routing | OSRM (open-source, free) |
| Places | Google Places API (via proxy) |

---

## Project Structure

```
yeli-vtc/
├── app/                          # Expo Router app directory
│   ├── (auth)/                   # Auth screens (login, register, otp)
│   ├── (customer)/               # Customer tab navigator
│   │   ├── home.tsx              # Find ride screen
│   │   ├── tracking.tsx          # Ride tracking screen
│   │   ├── rides.tsx             # Ride history
│   │   ├── profile.tsx           # Customer profile
│   │   └── _layout.tsx           # Tab layout
│   ├── (driver)/                 # Driver tab navigator
│   │   ├── home.tsx              # Driver home (availability toggle)
│   │   ├── dashboard.tsx         # Earnings dashboard
│   │   ├── profile.tsx           # Driver profile
│   │   └── _layout.tsx           # Tab layout
│   └── _layout.tsx               # Root layout
├── components/
│   ├── ui/                       # Reusable UI components
│   │   ├── GlassCard.tsx         # Glassmorphism card
│   │   ├── GlassPanel.tsx        # Glassmorphism panel
│   │   ├── VehicleCategoryModal.tsx
│   │   ├── LanguageSelector.tsx
│   │   ├── RideOfferModal.tsx    # Driver ride offer popup
│   │   └── Button.tsx
│   ├── maps/
│   │   ├── MapView.tsx           # Configured Google Maps
│   │   ├── DriverMarker.tsx      # Animated driver marker
│   │   ├── RoutePolyline.tsx     # OSRM route display
│   │   └── LocationMarkers.tsx   # Pickup/dropoff markers
│   └── ErrorBoundary.tsx
├── services/
│   ├── auth/
│   │   ├── emailAuthService.ts   # Email/password auth
│   │   └── phoneAuthService.ts   # Phone OTP auth
│   ├── voice/
│   │   ├── voiceService.ts       # TTS/STT wrapper
│   │   ├── intentParser.ts       # Voice command parser
│   │   ├── voiceAgent.ts         # Voice state machine
│   │   └── voiceFeedback.ts      # Predefined voice responses
│   ├── location/
│   │   ├── locationService.ts    # Location tracking
│   │   └── permissionService.ts  # Permission handling
│   ├── rides/
│   │   ├── bookingService.ts     # Create/cancel rides
│   │   ├── trackingService.ts    # Real-time ride tracking
│   │   └── historyService.ts     # Ride history
│   ├── routing/
│   │   ├── osrmService.ts        # OSRM routing
│   │   └── etaService.ts         # ETA calculations
│   └── firebase/
│       ├── firebaseConfig.ts     # Firebase initialization
│       └── firestoreService.ts   # Firestore operations
├── context/
│   ├── AuthContext.tsx           # Auth state
│   ├── ThemeContext.tsx          # Light/dark theme
│   ├── LanguageContext.tsx       # FR/WO/BM translations
│   └── RideContext.tsx           # Current ride state
├── utils/
│   ├── currency.ts               # F CFA formatting
│   ├── distance.ts               # Haversine calculations
│   ├── validation.ts             # Input validation
│   └── constants.ts              # App constants
├── hooks/
│   ├── useLocation.ts            # Location hook
│   ├── useVoice.ts               # Voice commands hook
│   └── useRide.ts                # Ride state hook
├── types/
│   ├── user.ts                   # User types
│   ├── driver.ts                 # Driver types
│   ├── ride.ts                   # Ride/job types
│   └── navigation.ts             # Navigation types
├── i18n/
│   ├── fr.json                   # French translations
│   ├── wo.json                   # Wolof translations (scaffold)
│   └── bm.json                   # Bambara translations (scaffold)
├── functions/                    # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts              # Function exports
│   │   ├── api/
│   │   │   ├── createJob.ts      # Create ride request
│   │   │   ├── cancelJob.ts      # Cancel ride
│   │   │   ├── placesProxy.ts    # Google Places proxy
│   │   │   └── heatmap.ts        # Demand heatmap
│   │   ├── triggers/
│   │   │   ├── onJobCreated.ts   # Dispatch driver
│   │   │   ├── onTripUpdated.ts  # Fraud detection
│   │   │   └── onDriverStatusChange.ts
│   │   ├── scheduled/
│   │   │   ├── enforceTimeouts.ts # Job/driver timeouts
│   │   │   └── updateHeatmap.ts  # Demand zones
│   │   ├── dispatch/
│   │   │   ├── dispatchAlgorithm.ts
│   │   │   ├── circuitBreaker.ts
│   │   │   └── fraudDetection.ts
│   │   └── utils/
│   │       ├── haversine.ts
│   │       ├── pricing.ts
│   │       └── notifications.ts
│   ├── package.json
│   └── tsconfig.json
├── app.json                      # Expo config
├── package.json
└── tsconfig.json
```

---

## Feature Requirements

### 1. Authentication System

#### 1.1 Email/Password Auth
- **Register**: Email, password (min 8 chars), name, phone number
- **Login**: Email + password
- **Password reset**: Email-based reset flow
- **Validation**: Real-time input validation with error messages

#### 1.2 Phone OTP Auth
- **Phone input**: International format with country selector (SN +221, CI +225, MR +222, FR +33)
- **OTP send**: Firebase Phone Auth, 6-digit code
- **OTP verify**: Auto-submit on 6 digits, 60s resend cooldown
- **Error handling**: Invalid code, expired code, rate limiting

#### 1.3 User Roles
- **Customer**: Can book rides, track rides, view history
- **Driver**: Can accept rides, manage availability, view earnings
- Role stored in Firestore `users` collection with `role` field

---

### 2. Customer App

#### 2.1 Find Ride Screen (`/customer/home`)
**Location Selection**
- Current location auto-detection with permission request
- Pickup address input with Google Places autocomplete
- Destination address input with Google Places autocomplete
- Map showing pickup marker (green) and dropoff marker (red)
- Route preview polyline (blue, dashed)

**Voice Booking**
- Microphone button to activate voice input
- Voice commands: "Je veux aller a [destination]"
- TTS confirmation: "Destination: [address]. Confirmer?"
- Voice confirmation: "Oui" / "Non"

**Vehicle Category Selection**
- Modal with 3 categories:
  - **Moto**: Icon motorcycle, base price 500 F CFA, 100 F/km
  - **Berline**: Icon car, base price 1000 F CFA, 200 F/km
  - **SUV**: Icon suv, base price 1500 F CFA, 300 F/km
- Show estimated price for each category
- Show estimated time for each category

**Booking Flow**
1. User selects pickup (or uses current location)
2. User selects destination
3. System shows route preview + ETA
4. User selects vehicle category
5. System shows price estimate
6. User confirms booking
7. System creates job in Firestore
8. Backend dispatches to nearest driver

#### 2.2 Ride Tracking Screen (`/customer/tracking`)
**Before Pickup**
- Map showing driver position (real-time updates every 3s)
- Driver info card: Name, photo, vehicle (make/model/color), plate, rating
- ETA to pickup (dynamic, recalculated on driver movement)
- Distance to pickup
- Route polyline from driver to pickup (green)
- Call driver button (opens phone dialer)
- Cancel ride button (confirmation modal)

**Voice Cancel**
- Say "Annuler la course"
- TTS: "Voulez-vous vraiment annuler? Dites oui pour confirmer."
- Say "Oui" to confirm, "Non" to abort

**During Ride**
- Map showing current position + route to destination
- ETA to destination
- Distance remaining
- Driver info card (persistent)

**Ride Completed**
- Show ride summary: Duration, distance, fare
- Rate driver (1-5 stars)
- Optional comment
- Navigate back to home

#### 2.3 Ride History Screen (`/customer/rides`)
- List of past rides with pagination (20 per page)
- Each ride card shows:
  - Date/time
  - Pickup address (truncated)
  - Dropoff address (truncated)
  - Status badge (completed/cancelled)
  - Fare in F CFA
  - Driver name + rating
- Filter by status (all/completed/cancelled)
- Pull-to-refresh
- Tap ride for detailed view

#### 2.4 Customer Profile Screen (`/customer/profile`)
- Profile photo (placeholder for now)
- Name (editable)
- Email (read-only)
- Phone (read-only)
- Language selector (FR/Wolof/Bambara)
- Theme toggle (light/dark)
- Logout button

---

### 3. Driver App

#### 3.1 Driver Home Screen (`/driver/home`)
**Availability Toggle**
- Large toggle switch: Online/Offline
- Status persisted to Firestore `drivers/{uid}.status`
- When online:
  - Start location tracking (high accuracy)
  - Update position to Firestore every 5 seconds
  - Show "En attente de courses..." message

**Location Permissions**
- Request foreground location permission
- Fallback from high accuracy to balanced if needed
- Show error if permission denied

**Ride Offer Modal**
- Triggered when `currentJobId` is set in driver document
- Shows:
  - Client name
  - Pickup address
  - Dropoff address
  - Distance (km)
  - Estimated fare (F CFA)
  - Vehicle category icon
- 30-second countdown timer (animated circle)
- Accept button (green)
- Decline button (red)
- Auto-decline on timeout

**Voice Commands for Offer**
- TTS announcement: "Nouvelle course! [Client] veut aller a [destination]. [X] francs. Accepter ou refuser?"
- Voice "Accepter" or "Oui" → Accept ride
- Voice "Refuser" or "Non" → Decline ride

#### 3.2 Active Ride Phases (5 phases)

**Phase 1: going_to_pickup**
- Map with route from driver to pickup (blue polyline)
- Pickup marker (green)
- ETA and distance to pickup
- Client info card: Name, phone
- Call client button
- "Je suis arrive" button → Phase 2
- Voice command: "Arrive" → Phase 2

**Phase 2: at_pickup**
- Map centered on pickup location
- Client info card with larger display
- Call client button
- "Demarrer la course" button → Phase 3
- Voice command: "Demarrer" → Phase 3

**Phase 3: in_ride**
- Map with route from current position to dropoff (blue polyline)
- Dropoff marker (red)
- ETA and distance to destination
- Route recalculation every 50m of movement
- Client info card (minimized)
- "Terminer la course" button → Confirmation modal → Phase 4
- Voice command: "Terminer" → TTS "Confirmer terminer?" → "Oui" → Phase 4

**Phase 4: completing**
- Processing spinner
- Update Firestore: job status = completed, trip status = completed
- Calculate final fare
- TTS: "Course terminee! [X] francs."
- Auto-transition to available (Phase 5 / back to home)

**Phase 5: Back to available**
- Clear current ride state
- Update driver status to "available"
- Show home screen with availability toggle ON

#### 3.3 Driver Dashboard Screen (`/driver/dashboard`)
- **Today's Earnings**: Sum of completed rides today (F CFA)
- **Rides Today**: Count of completed rides
- **Hours Online**: Time spent with status=online
- **Average Rating**: Driver's current rating
- Date picker for historical view (placeholder)
- Export button (placeholder)

#### 3.4 Driver Profile Screen (`/driver/profile`)
- Profile photo
- Name
- Phone
- Email
- Vehicle info: Make, Model, Color, Plate
- Rating (stars)
- Total rides completed
- Member since date
- Logout button

---

### 4. Backend (Cloud Functions)

#### 4.1 API Endpoints

**POST /createJob**
```typescript
Request: {
  customerId: string;
  pickupLocation: { lat: number; lng: number; address: string };
  dropoffLocation: { lat: number; lng: number; address: string };
  vehicleCategory: 'moto' | 'berline' | 'suv';
}
Response: {
  jobId: string;
  estimatedFare: number;
  estimatedDuration: number;
  estimatedDistance: number;
}
```
- Validate inputs
- Calculate fare using pricing algorithm
- Create job document in Firestore with status "pending"
- Trigger dispatch (via Firestore trigger)

**POST /cancelJob**
```typescript
Request: {
  jobId: string;
  reason?: string;
}
Response: {
  success: boolean;
}
```
- Validate job exists and belongs to user
- Update job status to "cancelled"
- If driver assigned, notify driver
- Update driver status back to "available"

**GET /places/autocomplete**
```typescript
Query: {
  input: string;
  sessiontoken: string;
}
Response: {
  predictions: Array<{
    description: string;
    place_id: string;
  }>;
}
```
- Proxy to Google Places API
- Add location bias for West Africa (SN, CI, MR, FR)
- Circuit breaker: 200 calls/day, 50/hour

**GET /places/details**
```typescript
Query: {
  place_id: string;
  sessiontoken: string;
}
Response: {
  location: { lat: number; lng: number };
  formatted_address: string;
}
```
- Proxy to Google Places API
- Return coordinates for selected place

**GET /heatmap**
```typescript
Response: {
  zones: Array<{
    center: { lat: number; lng: number };
    radius: number;
    intensity: number;
  }>;
  generatedAt: string;
}
```
- Return demand heatmap for driver positioning

#### 4.2 Firestore Triggers

**onJobCreated (jobs/{jobId})**
- Trigger: Document created with status "pending"
- Action:
  1. Find available drivers within 10km radius
  2. Filter: rating >= 4.0, battery > 20%, not currently busy
  3. Sort by distance (Haversine)
  4. Assign to nearest driver
  5. Update job status to "assigned"
  6. Update driver document with currentJobId
  7. Send FCM notification to driver
  8. TTS announcement via FCM data payload

**onTripUpdated (trips/{tripId})**
- Trigger: Document updated
- Action: Fraud detection
  - Speed > 150 km/h → Flag as suspicious
  - Idle > 10 min during ride → Flag as suspicious
  - Create alert in `alerts` collection

**onDriverStatusChange (drivers/{driverId})**
- Trigger: status field changed to "available"
- Action: Check for pending jobs in area, auto-assign if found

#### 4.3 Scheduled Functions

**enforceJobTimeouts (every 1 minute)**
- Find jobs with status "assigned" and assignedAt > 30 seconds ago
  - Remove driver assignment
  - Re-dispatch to next available driver
  - Increment redispatch count (max 3)
- Find jobs with status "pending" and createdAt > 5 minutes ago
  - Mark as "cancelled" with reason "no_drivers"
  - Notify customer

**updateHeatmap (every 60 minutes)**
- Aggregate completed rides from last 24 hours
- Calculate demand zones (cluster by area)
- Update `system/heatmap` document

#### 4.4 Dispatch Algorithm

```typescript
function findBestDriver(pickupLocation, vehicleCategory): Driver | null {
  // 1. Query available drivers within 10km
  const nearbyDrivers = queryDrivers({
    status: 'available',
    vehicleCategory: vehicleCategory,
    withinKm: 10,
    center: pickupLocation
  });

  // 2. Filter by quality
  const qualifiedDrivers = nearbyDrivers.filter(d =>
    d.rating >= 4.0 &&
    d.batteryLevel > 20 &&
    !d.currentJobId
  );

  // 3. Sort by distance
  const sorted = qualifiedDrivers.sort((a, b) =>
    haversine(pickupLocation, a.location) - haversine(pickupLocation, b.location)
  );

  // 4. Return nearest
  return sorted[0] || null;
}
```

#### 4.5 Circuit Breakers

**Dispatch Circuit Breaker**
- Max 1000 dispatches/day
- Max 100 dispatches/hour
- 5 consecutive errors → Open circuit for 5 minutes
- Stored in `system_safety/dispatch_breaker`

**Places API Circuit Breaker**
- Max 200 calls/day
- Max 50 calls/hour
- 10 consecutive errors → Open circuit for 10 minutes
- Stored in `system_safety/places_breaker`

#### 4.6 Fraud Detection

```typescript
function detectFraud(tripUpdate: TripUpdate): Alert | null {
  // Speed check
  if (tripUpdate.speed > 150) {
    return { type: 'excessive_speed', value: tripUpdate.speed };
  }

  // Idle check (during in_ride phase)
  if (tripUpdate.phase === 'in_ride') {
    const idleTime = Date.now() - tripUpdate.lastMovementAt;
    if (idleTime > 10 * 60 * 1000) { // 10 minutes
      return { type: 'excessive_idle', value: idleTime };
    }
  }

  return null;
}
```

---

### 5. Voice System

#### 5.1 Text-to-Speech (TTS)
- Use `expo-speech` native module
- Language: French (fr-FR)
- Rate: 1.0 (normal speed)
- Pitch: 1.0 (normal pitch)

**TTS Messages (French)**
```typescript
const messages = {
  // Customer
  destinationConfirm: (addr) => `Destination: ${addr}. Dites oui pour confirmer.`,
  rideBooked: 'Course reservee. Un chauffeur arrive bientot.',
  driverArriving: (name, eta) => `${name} arrive dans ${eta} minutes.`,
  rideStarted: 'La course a demarre.',
  rideCompleted: (fare) => `Course terminee. ${fare} francs CFA.`,

  // Driver
  newRide: (client, dest, fare) => `Nouvelle course! ${client} veut aller a ${dest}. ${fare} francs. Accepter ou refuser?`,
  rideAccepted: 'Course acceptee. Dirigez-vous vers le client.',
  arrivedPickup: 'Vous etes arrive. Attendez le client.',
  rideStartedDriver: 'Course demarree. Bonne route!',
  rideCompletedDriver: (fare) => `Course terminee! ${fare} francs.`,
  confirmComplete: 'Voulez-vous terminer la course? Dites oui pour confirmer.',
  confirmCancel: 'Voulez-vous vraiment annuler? Dites oui pour confirmer.'
};
```

#### 5.2 Speech-to-Text (STT)
- Use `@react-native-voice/voice`
- Language: French (fr-FR)
- Continuous mode: false (single utterance)
- Show partial results during recognition

#### 5.3 Intent Parser

```typescript
type VoiceIntent =
  | { type: 'DESTINATION'; value: string }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' }
  | { type: 'ACCEPT_RIDE' }
  | { type: 'REJECT_RIDE' }
  | { type: 'START_RIDE' }
  | { type: 'COMPLETE_RIDE' }
  | { type: 'ARRIVED_PICKUP' }
  | { type: 'UNKNOWN' };

function parseIntent(transcript: string): VoiceIntent {
  const normalized = transcript.toLowerCase().trim();

  // Destination patterns
  if (normalized.match(/(?:aller|vers|a|direction)\s+(.+)/)) {
    return { type: 'DESTINATION', value: match[1] };
  }

  // Confirmation
  if (normalized.match(/^(oui|ok|d'accord|confirme|c'est bon)$/)) {
    return { type: 'CONFIRM' };
  }

  // Cancellation
  if (normalized.match(/^(non|annule|refuse)$/)) {
    return { type: 'CANCEL' };
  }

  // Driver commands
  if (normalized.match(/(accepte|prend)/)) {
    return { type: 'ACCEPT_RIDE' };
  }
  if (normalized.match(/(refuse|decline)/)) {
    return { type: 'REJECT_RIDE' };
  }
  if (normalized.match(/(demarre|commence|go)/)) {
    return { type: 'START_RIDE' };
  }
  if (normalized.match(/(termine|fini|arrive)/)) {
    return { type: 'COMPLETE_RIDE' };
  }
  if (normalized.match(/suis arrive/)) {
    return { type: 'ARRIVED_PICKUP' };
  }

  return { type: 'UNKNOWN' };
}
```

---

### 6. Routing (OSRM)

#### 6.1 OSRM Service

```typescript
const OSRM_BASE = 'https://router.project-osrm.org';

async function getRoute(
  origin: LatLng,
  destination: LatLng
): Promise<Route> {
  const url = `${OSRM_BASE}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.code !== 'Ok') {
    throw new Error('OSRM routing failed');
  }

  const route = data.routes[0];
  return {
    distance: route.distance, // meters
    duration: route.duration, // seconds
    polyline: decodePolyline(route.geometry)
  };
}
```

#### 6.2 Polyline Decoding

```typescript
function decodePolyline(encoded: string): LatLng[] {
  // Google polyline algorithm decoder
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += ((result & 1) ? ~(result >> 1) : (result >> 1));

    // Decode longitude (same process)
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += ((result & 1) ? ~(result >> 1) : (result >> 1));

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}
```

---

### 7. Pricing Algorithm

```typescript
const PRICING = {
  moto: { base: 500, perKm: 100, perMin: 20 },
  berline: { base: 1000, perKm: 200, perMin: 40 },
  suv: { base: 1500, perKm: 300, perMin: 60 }
};

function calculateFare(
  category: VehicleCategory,
  distanceKm: number,
  durationMin: number
): number {
  const pricing = PRICING[category];
  const distanceFare = distanceKm * pricing.perKm;
  const timeFare = durationMin * pricing.perMin;
  const total = pricing.base + distanceFare + timeFare;

  // Round to nearest 50 F CFA
  return Math.ceil(total / 50) * 50;
}
```

---

### 8. Firestore Collections

#### users
```typescript
{
  uid: string;
  email: string;
  phone: string;
  name: string;
  role: 'customer' | 'driver';
  createdAt: Timestamp;
  language: 'fr' | 'wo' | 'bm';
}
```

#### drivers
```typescript
{
  uid: string;
  name: string;
  phone: string;
  email: string;
  photo?: string;
  vehicle: {
    category: 'moto' | 'berline' | 'suv';
    make: string;
    model: string;
    color: string;
    plate: string;
  };
  rating: number;
  totalRides: number;
  status: 'offline' | 'available' | 'busy';
  location: GeoPoint;
  lastLocationUpdate: Timestamp;
  currentJobId?: string;
  batteryLevel?: number;
}
```

#### jobs
```typescript
{
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  driverId?: string;
  driverName?: string;
  pickup: {
    location: GeoPoint;
    address: string;
  };
  dropoff: {
    location: GeoPoint;
    address: string;
  };
  vehicleCategory: 'moto' | 'berline' | 'suv';
  status: 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  estimatedFare: number;
  finalFare?: number;
  estimatedDistance: number;
  estimatedDuration: number;
  createdAt: Timestamp;
  assignedAt?: Timestamp;
  acceptedAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancellationReason?: string;
  redispatchCount: number;
  excludedDrivers: string[];
}
```

#### trips
```typescript
{
  id: string;
  jobId: string;
  driverId: string;
  customerId: string;
  phase: 'going_to_pickup' | 'at_pickup' | 'in_ride' | 'completing' | 'completed';
  positions: Array<{
    location: GeoPoint;
    timestamp: Timestamp;
    speed?: number;
  }>;
  route: {
    pickup: GeoPoint;
    dropoff: GeoPoint;
    polyline: string;
  };
  lastMovementAt: Timestamp;
}
```

#### system_safety
```typescript
// dispatch_breaker
{
  dailyCount: number;
  hourlyCount: number;
  consecutiveErrors: number;
  isOpen: boolean;
  lastReset: Timestamp;
}

// places_breaker
{
  dailyCount: number;
  hourlyCount: number;
  consecutiveErrors: number;
  isOpen: boolean;
  lastReset: Timestamp;
}
```

#### alerts
```typescript
{
  id: string;
  type: 'excessive_speed' | 'excessive_idle' | 'suspicious_route';
  tripId: string;
  driverId: string;
  value: any;
  createdAt: Timestamp;
  resolved: boolean;
}
```

---

### 9. UI Components

#### 9.1 GlassCard
- Background: rgba(255, 255, 255, 0.1)
- Blur: 10px
- Border: 1px solid rgba(255, 255, 255, 0.2)
- Border radius: 16px
- Shadow: subtle drop shadow

#### 9.2 VehicleCategoryModal
- Full-screen modal with blur backdrop
- 3 vehicle cards in vertical stack
- Each card shows: Icon, Name, Price/km, Estimated total
- Selected card has highlighted border
- Confirm button at bottom

#### 9.3 RideOfferModal (Driver)
- Slide-up modal
- Circular countdown timer (30s)
- Client name and photo
- Pickup/dropoff addresses
- Distance and fare
- Accept (green) and Decline (red) buttons
- Auto-dismiss on timeout

#### 9.4 LanguageSelector
- Dropdown or segmented control
- Options: Francais, Wolof, Bambara
- Updates app language context

---

### 10. Internationalization (i18n)

#### French (complete)
All UI strings in French

#### Wolof (scaffold)
Key phrases for voice and critical UI

#### Bambara (scaffold)
Key phrases for voice and critical UI

---

### 11. Theme System

#### Light Theme
```typescript
{
  background: '#FFFFFF',
  surface: '#F5F5F5',
  primary: '#FF6B00', // Yeli orange
  text: '#1A1A1A',
  textSecondary: '#666666',
  success: '#00C853',
  error: '#FF1744',
  border: '#E0E0E0'
}
```

#### Dark Theme
```typescript
{
  background: '#121212',
  surface: '#1E1E1E',
  primary: '#FF6B00',
  text: '#FFFFFF',
  textSecondary: '#AAAAAA',
  success: '#00E676',
  error: '#FF5252',
  border: '#333333'
}
```

---

### 12. Testing Requirements

#### Unit Tests
- Pricing algorithm
- Distance calculations (Haversine)
- Intent parser
- Currency formatting

#### Integration Tests
- Auth flows (email + phone)
- Booking flow
- Driver acceptance flow
- Ride phase transitions

#### E2E Tests (Placeholder)
- Full booking to completion flow
- Voice booking flow
- Driver multi-ride flow

---

### 13. Error Handling

#### Network Errors
- Show "Connexion perdue" toast
- Retry with exponential backoff
- Queue mutations for offline sync (Phase 4)

#### Location Errors
- Permission denied: Show settings prompt
- Location unavailable: Show manual address input
- Low accuracy: Show warning, allow continue

#### Voice Errors
- STT unavailable: Fallback to text input
- TTS unavailable: Show text instead of speaking
- Recognition failed: Prompt to repeat

---

### 14. Security Requirements

- No API keys in client code
- All sensitive operations via Cloud Functions
- Firestore security rules:
  - Users can only read/write their own data
  - Drivers can only update their own status/location
  - Jobs readable by involved customer/driver only
- Rate limiting on all API endpoints
- Input validation on all endpoints

---

### 15. Performance Requirements

- App launch: < 3 seconds
- Map load: < 2 seconds
- Place search response: < 1 second
- Driver position update: Every 3-5 seconds
- Route recalculation: On 50m+ movement
- Ride tracking latency: < 3 seconds

---

## Success Criteria

1. Customer can book a ride via UI or voice in < 30 seconds
2. Driver receives ride offer within 30 seconds of booking
3. Real-time tracking updates every 3-5 seconds
4. All prices displayed in F CFA (no euros)
5. French UI complete, Wolof/Bambara scaffolded
6. Voice commands work for booking and driver actions
7. Circuit breakers prevent API abuse
8. Fraud detection flags suspicious rides
9. TypeScript compiles with no errors
10. All unit tests pass

---

## Out of Scope (Phase 2+)

- Payment integration (Orange Money, MTN MoMo)
- Offline mode with mutation queue
- Push notifications (foreground/background)
- Driver earnings export (CSV/PDF)
- Advanced analytics
- LLM-based voice (Qwen2)
- WhatsApp OTP alternative
