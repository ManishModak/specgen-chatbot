# Registry-Based Component Validation

## Overview
The chatbot now uses the **same registry files** as the scraper for component validation, ensuring:
- Single source of truth for component definitions
- Automatic updates when registries are modified
- Proper gaming tier classification
- CPU/Motherboard socket compatibility checking

## File Structure

### Scraper (Source of Truth)
```
specgen-scraper/scraper-data/registry/
├── gpus.yaml           # GPU registry with performance tiers
├── cpus.yaml           # CPU registry with socket info
├── motherboards.yaml   # Motherboard registry with chipsets
├── ram.yaml           # RAM registry
├── storage.yaml       # Storage registry
├── psu.yaml           # PSU registry
├── cabinets.yaml      # Case registry
└── cpu_coolers.yaml   # CPU cooler registry
```

### Chatbot (JSON Copies)
```
specgen-scraper/scraper-data/registry_json/
├── gpus.json          # Converted from YAML
├── cpus.json
├── motherboards.json
└── ...
```

## How It Works

### 1. Registry Conversion
When registries are updated in the scraper, run:
```bash
cd specgen-scraper
python scripts/convert_registries.py
```

This converts YAML → JSON for the chatbot to read.

### 2. Gaming Performance Tiers

The system automatically classifies components into tiers:

**GPU Tiers (from registry):**
- **Entry**: GTX 1650/1660, RTX 3050, RX 6500
- **Good**: RTX 3060/4060, RX 6600, Arc A750 ← *For 1080p high settings*
- **High**: RTX 4060 Ti/4070, RX 7600/7700, Arc A770
- **Enthusiast**: RTX 4070 Ti/4080/4090, RX 7800/7900

**CPU Tiers (from registry):**
- **Entry**: i3, Ryzen 3, Athlon
- **Good**: i5, Ryzen 5
- **High**: i7, Ryzen 7
- **Enthusiast**: i9, Ryzen 9, Threadripper

### 3. Compatibility Checking

```typescript
// Check CPU/Motherboard compatibility
const result = checkCPUMotherboardCompatibility(
    "Intel Core i5-14600K",
    "MSI B760 Gaming Plus"
);
// Returns: { compatible: true, cpuSocket: "LGA 1700", motherboardSocket: "LGA 1700" }
```

### 4. Gaming Suitability

```typescript
// Check if GPU is suitable for gaming
isGamingSuitableGPU("RTX 4060", true);  // true - good for high settings
isGamingSuitableGPU("GT 730", true);    // false - entry level

// Check CPU tier
getCPUGamingTier("Ryzen 5 7600");  // "good"
getCPUGamingTier("Athlon 3000G");  // "entry"
```

## Adding New Components

### To add a new GPU:

1. **Edit** `specgen-scraper/scraper-data/registry/gpus.yaml`:
```yaml
brands:
  nvidia:
    series:
      rtx_50:
        models:
          - name: "5090 Ti"  # New model
            search_terms: ["RTX 5090 Ti", "GeForce RTX 5090 Ti"]
```

2. **Convert** registries:
```bash
python scripts/convert_registries.py
```

3. **Restart** chatbot - it will automatically pick up the new JSON files

### Performance Tier Assignment

Tiers are determined by series in the registry:
- `rtx_50`, `rx_90` → Enthusiast
- `rtx_40`, `rx_70` → High
- `rtx_30`, `rx_60` → Good
- `gtx`, `rx_55` → Entry

## Key Functions

### Registry Loader (`src/lib/registry-loader.ts`)

- `matchGPUFromRegistry(productName)` - Check if product matches registry
- `matchCPUFromRegistry(productName)` - Check if product matches registry  
- `checkCPUMotherboardCompatibility(cpu, motherboard)` - Validate socket match
- `getGPUGamingTier(productName)` - Get gaming performance tier
- `getCPUGamingTier(productName)` - Get gaming performance tier
- `isGamingSuitableGPU(productName, highPerformance)` - Check if suitable
- `isGamingSuitableCPU(productName)` - Check if suitable

### Search Functions (`src/lib/search.ts`)

- `vectorSearch(embedding, limit, query)` - Semantic search with gaming boost
- `keywordSearch(query, limit)` - Keyword-based search
- `optimizeResultsForQuery(query, results, limit)` - Deduplicate and balance

## Benefits

1. **Single Source of Truth**: Edit registries once, both scraper and chatbot use them
2. **Gaming Intelligence**: Automatically knows which components are good for gaming
3. **Compatibility Checking**: Prevents incompatible CPU/motherboard combinations
4. **Performance Tiers**: Boosts high-tier GPUs in search results for gaming queries
5. **Easy Updates**: Just convert registries and restart - no code changes needed

## Registry Maintenance

**When to update registries:**
- New GPU/CPU series launched (e.g., RTX 50 series)
- New motherboard chipsets released
- Missing products found during scraping

**Update process:**
1. Edit YAML files in `specgen-scraper/scraper-data/registry/`
2. Run `python scripts/convert_registries.py`
3. Restart chatbot dev server
4. Test with gaming queries

## Troubleshooting

**Issue**: Chatbot not recognizing new components
- Check: Did you convert registries? `python scripts/convert_registries.py`
- Check: Are JSON files in `registry_json/` folder?
- Check: Did you restart the server?

**Issue**: Gaming queries returning entry-level GPUs
- Check: Are GPUs properly categorized in `gpus.yaml`?
- Check: Does the series match the tier pattern (rtx_40 = high)?
- Check: Are search terms comprehensive?

**Issue**: CPU/Motherboard compatibility errors
- Check: Does CPU have `socket` field in `cpus.yaml`?
- Check: Does motherboard chipset exist in `motherboards.yaml`?
- Check: Are sockets matching exactly (e.g., "LGA 1700" vs "LGA1700")?
