
# Tourism Explorer

Tourism Explorer is a standalone [hyperDart](https://hyperdart.com) component that helps users discover tourist attractions through natural-language queries such as *"things to do in Paris"*, *"museums in Delhi"*, or *"forts near Kurukshetra"*.

Instead of redirecting users to lengthy travel articles, it presents relevant places, useful information, and directions in a compact, interactive interface.

- **Demo Video:** [Add your YouTube demo link]
- **GitHub Repository:** [Add your repository link]
- **Package:** `@hyperdart/tourismexplorer` on the hyperDart development registry

## The Idea

Planning a trip often involves searching multiple websites to find places worth visiting. Tourism Explorer simplifies this process by identifying the location and category in a user's query and presenting relevant tourist attractions directly inside hyperDart.

Users can explore attractions, switch between categories, read available descriptions, check locations, view a map, and generate a simple day plan.

The goal is to make travel discovery faster, more interactive, and easier to use in both the sidebar and mainline views.

## Features

### Core Features

- **Natural-language query support:** Handles queries such as "things to do in Paris", "museums in Delhi", and "landmarks in Rome".
- **Category-based discovery:** Explore all sights, museums, temples, forts, monuments, viewpoints, parks, and historic sites.
- **Location-aware results:** Finds attractions near the location resolved by hyperDart.
- **Place details:** Displays names, categories, distances, addresses, and available descriptions.
- **Directions:** Opens Google Maps directions for a selected attraction.
- **Loading and error handling:** Provides loading indicators, error messages, retry options, and clear empty-result states.
- **Responsive interface:** Adapts to narrow sidebar layouts and wider mainline views.

### Additional Features

- **Interactive map:** A lightweight SVG map displays attraction positions, distance rings, and numbered markers.
- **Day planner:** Arranges selected attractions into morning, afternoon, and evening groups using a nearest-neighbour approach.
- **Weather forecast:** Displays weather information and simple recommendations for planning outdoor activities.
- **Place descriptions:** Retrieves available summaries and thumbnails from Wikipedia when a place card is expanded.
- **Distance information:** Shows approximate distances from the searched location and, when appropriate, the user's location.
- **Accessibility information:** Displays wheelchair-accessibility information when it is available in the place data.

## Design Decisions

### 1. Answer First, Details on Demand

The component displays the most relevant places immediately. Users can expand individual cards when they want more information, keeping the interface compact and easy to scan.

### 2. Responsive Sidebar and Mainline Layout

The layout adapts to the available component width. A `ResizeObserver` detects changes in the rendered width so the interface can adjust to narrow sidebars as well as larger views.

### 3. Lightweight SVG Map

Instead of depending on an external map-rendering library or map tiles, the component uses SVG to display the relative positions of attractions and their distances from the searched location. This keeps the map lightweight and suitable for compact layouts.

### 4. Simple, Light Visual Design

The interface uses a light theme, clean typography, rounded cards, subtle borders, and a consistent accent colour. The design focuses on readability and makes the attraction information easy to scan.

### 5. Relevant Results Over Unnecessary Listings

The component uses category-based filtering and place-data normalization to improve the relevance of results and avoid duplicate entries. Its purpose is to surface tourist attractions rather than unrelated commercial listings.

### 6. Graceful Handling of Optional Data

Weather forecasts and Wikipedia summaries are supplementary features. If optional information is unavailable, the main attraction-discovery experience should remain usable.

## Data Sources

| Data | Source | Usage |
|---|---|---|
| Tourist attractions | [Geoapify Places API](https://apidocs.geoapify.com/docs/places/) | Retrieves nearby places using geographic coordinates and categories |
| Underlying place data | OpenStreetMap, through Geoapify | Supplies available place information |
| Descriptions and thumbnails | Wikipedia REST API | Provides additional information when a matching article is available |
| Weather forecasts | [Open-Meteo](https://open-meteo.com/) | Provides weather information for trip planning |

The Geoapify API key is configured on the backend rather than exposed in frontend code.

## Technology Stack

- **Frontend:** React and Vite
- **Backend:** Express.js
- **Runtime and integration:** Cloudflare Workers and Wrangler, using the generated hyperDart template
- **Places API:** Geoapify
- **Weather API:** Open-Meteo
- **Descriptions:** Wikipedia REST API
- **Styling:** CSS
- **Map visualization:** SVG
- **Version control:** Git and GitHub

## Project Structure

```text
tourism-explorer/
├── src/
│   ├── backend/
│   │   ├── index.js
│   │   ├── schema.jsonc
│   │   └── wrangler.jsonc
│   ├── frontend/
│   │   ├── index.jsx
│   │   └── NewComponent.jsx
│   └── sandbox/
│       └── main.jsx
├── hyperdart.config.js
├── searchData.json
├── .gitignore
├── package.json
└── README.md
```

The frontend handles query interpretation, category selection, result presentation, map rendering, and day-plan visualization. The backend handles requests to external services and keeps API credentials out of the frontend.

*Note: The exact files and build output may vary slightly depending on the generated hyperDart template.*

## How It Works

1. **Read the search payload:** The component receives `searchData` from hyperDart and normalizes it to extract the original query, location name, and geographic coordinates.
2. **Detect the category:** Keyword matching identifies the requested category, such as museums, temples, forts, parks, or historic sites.
3. **Fetch nearby attractions:** The frontend requests data from the backend using the location's latitude, longitude, category, and search radius.
4. **Retrieve place data:** The backend queries Geoapify and normalizes the returned records for the frontend.
5. **Display the results:** Attractions appear as expandable cards with available place details and directions.
6. **Explore additional views:** Users can switch to the SVG map or view a day plan generated using a nearest-neighbour ordering strategy.
7. **Load optional information:** Weather forecasts and Wikipedia summaries add context when the corresponding services return usable data.

## Running Locally

### Prerequisites

- Node.js and npm
- A Geoapify account and API key
- Git

### 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd tourism-explorer
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with the actual repository URL.

### 2. Install Dependencies

```bash
npm install
cd src/backend
npm install
cd ../..
```

### 3. Configure Environment Variables

Create `src/backend/.dev.vars`:

```dotenv
GEOAPIFY_API_KEY=your_geoapify_api_key
```

Use the exact environment-variable name expected by your backend implementation. If your code uses `GEOAPIFY_KEY` instead, keep the configuration consistent.

Configure the local frontend backend URL in `.env.development` if required by your template:

```dotenv
VITE_API_URL=http://127.0.0.1:3001
```

Obtain a Geoapify key from [Geoapify](https://www.geoapify.com/).

**Security:** Never commit `.dev.vars`, API keys, or other secrets to GitHub.

### 4. Start the Development Servers

Start the backend in one terminal using the scripts defined in `src/backend/package.json`:

```bash
cd src/backend
npm start
```

Start the frontend in another terminal from the project root:

```bash
npm start
```

Open the local URL provided by Vite or the generated hyperDart development environment.

### 5. Test Different Queries

Use the sandbox and `searchData.json` to test queries such as:

- `things to do in Paris`
- `museums in Delhi`
- `temples in Kyoto`
- `forts near Kurukshetra`
- `landmarks in Rome`

Also test empty results, unavailable API responses, and both city-level and larger-area locations.

## hyperDart Trigger Queries

The component uses keywords and regular expressions in `hyperdart.config.js` to recognize travel-related queries.

Supported query patterns include:

- Tourist attractions in a location
- Things to do in a location
- Places to visit in a location
- Landmarks and sights near a location
- Museums, temples, forts, monuments, viewpoints, parks, and historic sites in a location

The `HD_LOCATION` entity pattern allows hyperDart to resolve supported place names and supply their geographic information to the component.

## Building and Publishing

Build the frontend and backend using the scripts supplied by the generated template:

```bash
npm run build
cd src/backend
npm run build
cd ../..
```

Before publishing, verify the package metadata, build output paths, trigger configuration, GitHub URL, demo-video URL, and backend secret configuration.

Publish the component using the official hyperDart development-registry instructions:

```bash
npm publish
```

The package must pass the registry's normal validation checks. Refer to the [hyperDart publishing documentation](https://hyperdart.com/docs/docs/publish/) for package creation and registry authentication.

## Known Limitations

- Place descriptions and thumbnails depend on a matching Wikipedia article.
- Attraction coverage and metadata quality depend on the available Geoapify/OpenStreetMap data.
- The SVG map shows relative positions rather than actual streets or turn-by-turn routes.
- The day plan uses geographic proximity to order places; it does not necessarily account for traffic, opening hours, or actual road travel time.
- Weather and optional external data may be unavailable.
- Accessibility details are only displayed when the underlying data provides them.

## AI Tools Used

Document the AI tools you actually used and the tasks for which you used them, such as architecture planning, React component development, backend integration, styling, debugging, or README preparation.

Clearly distinguish AI-assisted suggestions from the code, testing, design decisions, and modifications completed by you.

## Author

**Kunal Gautam**
