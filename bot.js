import { AtpAgent } from '@atproto/api';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

// Configuration from environment variables
const CONFIG = {
  stationId: process.env.STATION_ID || '17550',
  birdweatherToken: process.env.BIRDWEATHER_TOKEN,
  blueskyHandle: process.env.BLUESKY_HANDLE,
  blueskyAppPassword: process.env.BLUESKY_APP_PASSWORD,
  flickrApiKey: process.env.FLICKR_API_KEY,
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '15'),
  minConfidence: parseFloat(process.env.MIN_CONFIDENCE || '0.7'),
  includeLink: process.env.INCLUDE_LINK !== 'false',
  includeImage: process.env.INCLUDE_IMAGE !== 'false',
  timezone: process.env.TIMEZONE || 'America/New_York',
};

// State file for persistence
const STATE_FILE = '/app/data/last_check.json';
let lastCheckTime = new Date();
let agent = null;

// Load last check time from file
async function loadState() {
  try {
    await fs.mkdir('/app/data', { recursive: true });
    const data = await fs.readFile(STATE_FILE, 'utf8');
    const state = JSON.parse(data);
    lastCheckTime = new Date(state.lastCheckTime);
    const formattedTime = lastCheckTime.toLocaleString('en-US', {
      timeZone: CONFIG.timezone,
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const tz = lastCheckTime.toLocaleString('en-US', {
      timeZone: CONFIG.timezone,
      timeZoneName: 'short'
    }).split(' ').pop();
    console.log(`✓ Loaded state: last check was ${formattedTime} ${tz}`);
  } catch (error) {
    console.log('No previous state found, starting fresh');
  }
}

// Save last check time to file
async function saveState() {
  try {
    await fs.writeFile(STATE_FILE, JSON.stringify({ lastCheckTime }));
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

// Initialize Bluesky agent
async function initBluesky() {
  agent = new AtpAgent({ service: 'https://bsky.social' });
  
  await agent.login({
    identifier: CONFIG.blueskyHandle,
    password: CONFIG.blueskyAppPassword,
  });
  
  console.log('✓ Logged into Bluesky');
}

// Fetch bird image from Flickr
async function fetchBirdImage(birdName) {
  if (!CONFIG.flickrApiKey || !CONFIG.includeImage) {
    return null;
  }

  try {
    const searchUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${CONFIG.flickrApiKey}&text=${encodeURIComponent(birdName)}&license=1,2,3,4,5,6,9,10&content_type=1&media=photos&per_page=5&format=json&nojsoncallback=1&sort=relevance`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.photos && data.photos.photo && data.photos.photo.length > 0) {
      // Get a random photo from the results
      const photo = data.photos.photo[Math.floor(Math.random() * Math.min(5, data.photos.photo.length))];
      
      // Fetch photographer info
      const infoUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.getInfo&api_key=${CONFIG.flickrApiKey}&photo_id=${photo.id}&format=json&nojsoncallback=1`;
      const infoResponse = await fetch(infoUrl);
      const infoData = await infoResponse.json();
      
      const photographer = infoData.photo?.owner?.username || infoData.photo?.owner?.realname || 'Unknown';
      const photoUrl = `https://www.flickr.com/photos/${photo.owner}/${photo.id}`;
      
      const imageUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_b.jpg`;
      
      // Download the image
      const imgResponse = await fetch(imageUrl);
      const imageBuffer = await imgResponse.arrayBuffer();
      
      return {
        data: new Uint8Array(imageBuffer),
        mimeType: 'image/jpeg',
        photographer: photographer,
        photoUrl: photoUrl,
      };
    }
  } catch (error) {
    console.error('Error fetching Flickr image:', error.message);
  }
  
  return null;
}

// Fetch recent detections from BirdWeather
async function fetchDetections() {
  const url = `https://app.birdweather.com/api/v1/stations/${CONFIG.stationId}/detections`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CONFIG.birdweatherToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`BirdWeather API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.detections || [];
  } catch (error) {
    console.error('Error fetching detections:', error);
    return [];
  }
}

// Filter detections for new ones since last check and deduplicate by species
function filterNewDetections(detections) {
  // First filter by time and confidence
  const validDetections = detections.filter(d => {
    const detectionTime = new Date(d.timestamp);
    const confidence = d.confidence || 0;
    
    return detectionTime > lastCheckTime && confidence >= CONFIG.minConfidence;
  });
  
  // Group by species and keep only the highest confidence detection for each
  const speciesMap = new Map();
  
  for (const detection of validDetections) {
    const species = detection.species?.commonName || 'Unknown';
    const existing = speciesMap.get(species);
    
    if (!existing || detection.confidence > existing.confidence) {
      speciesMap.set(species, detection);
    }
  }
  
  // Return array of best detections per species
  return Array.from(speciesMap.values());
}

// Format and post detection to Bluesky
async function postToBluesky(detection) {
  const species = detection.species?.commonName || 'Unknown bird';
  const confidence = Math.round((detection.confidence || 0) * 100);
  const detectionDate = new Date(detection.timestamp);
  
  const time = detectionDate.toLocaleString('en-US', {
    timeZone: CONFIG.timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const timeZone = detectionDate.toLocaleString('en-US', {
    timeZone: CONFIG.timezone,
    timeZoneName: 'short'
  }).split(' ').pop();
  
  // Create hashtag from species name (remove spaces and special characters)
  const hashtag = species.replace(/[^a-zA-Z0-9]/g, '');
  
  let postText = `🐦 ${species} detected!\n\n`;
  postText += `Confidence: ${confidence}%\n`;
  postText += `Time: ${time} ${timeZone}\n\n`;
  postText += `#${hashtag} #BirdNET`;
  
  if (CONFIG.includeLink && detection.id) {
    postText += `\n\n🔊 Listen: https://app.birdweather.com/detections/${detection.id}`;
  }
  
  try {
    // Try to fetch bird image
    const image = await fetchBirdImage(species);
    
    // Add photo credit if image is present
    if (image && image.photographer) {
      postText += `\n\n📷 Photo: ${image.photographer} (Flickr)`;
    }
    
    // Build the post with proper byte position tracking
    const encoder = new TextEncoder();
    const facets = [];
    
    // Find and create facet for each hashtag
    const hashtagRegex = /#(\w+)/g;
    let match;
    while ((match = hashtagRegex.exec(postText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      facets.push({
        index: {
          byteStart: encoder.encode(postText.substring(0, start)).length,
          byteEnd: encoder.encode(postText.substring(0, end)).length,
        },
        features: [{
          $type: 'app.bsky.richtext.facet#tag',
          tag: match[1],
        }],
      });
    }
    
    // Find and create facet for URL if present
    if (CONFIG.includeLink && detection.id) {
      const urlText = `https://app.birdweather.com/detections/${detection.id}`;
      const urlStart = postText.indexOf(urlText);
      if (urlStart !== -1) {
        const urlEnd = urlStart + urlText.length;
        
        facets.push({
          index: {
            byteStart: encoder.encode(postText.substring(0, urlStart)).length,
            byteEnd: encoder.encode(postText.substring(0, urlEnd)).length,
          },
          features: [{
            $type: 'app.bsky.richtext.facet#link',
            uri: urlText,
          }],
        });
      }
    }
    
    // Add facet for Flickr photographer link if present
    if (image && image.photoUrl && image.photographer) {
      const photographerStart = postText.indexOf(image.photographer);
      if (photographerStart !== -1) {
        const photographerEnd = photographerStart + image.photographer.length;
        
        facets.push({
          index: {
            byteStart: encoder.encode(postText.substring(0, photographerStart)).length,
            byteEnd: encoder.encode(postText.substring(0, photographerEnd)).length,
          },
          features: [{
            $type: 'app.bsky.richtext.facet#link',
            uri: image.photoUrl,
          }],
        });
      }
    }
    
    const postPayload = {
      text: postText,
      facets: facets.length > 0 ? facets : undefined,
      createdAt: new Date().toISOString(),
    };
    
    // Add image if found
    if (image) {
      const uploadResponse = await agent.uploadBlob(image.data, {
        encoding: image.mimeType,
      });
      
      postPayload.embed = {
        $type: 'app.bsky.embed.images',
        images: [{
          alt: `Photo of a ${species}`,
          image: uploadResponse.data.blob,
        }],
      };
    }
    
    await agent.post(postPayload);
    
    console.log(`✓ Posted: ${species} (${confidence}%)${image ? ' with image' : ''}`);
  } catch (error) {
    console.error(`Error posting ${species}:`, error);
  }
}

// Main polling loop
async function pollAndPost() {
  const now = new Date();
  const formattedTime = now.toLocaleString('en-US', {
    timeZone: CONFIG.timezone,
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  const tz = now.toLocaleString('en-US', {
    timeZone: CONFIG.timezone,
    timeZoneName: 'short'
  }).split(' ').pop();
  
  console.log(`\n⏰ Checking for new detections at ${formattedTime} ${tz}...`);
  
  const detections = await fetchDetections();
  const newDetections = filterNewDetections(detections);
  
  if (newDetections.length === 0) {
    console.log('No new detections found');
  } else {
    console.log(`Found ${newDetections.length} new detection(s)`);
    
    // Post each detection (with a small delay between posts)
    for (const detection of newDetections) {
      await postToBluesky(detection);
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }
  }
  
  lastCheckTime = new Date();
  await saveState();
}

// Start the bot
async function start() {
  console.log('🤖 Starting BirdWeather to Bluesky Bot...\n');
  
  // Validate configuration
  if (!CONFIG.birdweatherToken || !CONFIG.blueskyAppPassword) {
    console.error('❌ Missing required environment variables!');
    console.error('Please set BIRDWEATHER_TOKEN and BLUESKY_APP_PASSWORD');
    process.exit(1);
  }
  
  // Load previous state
  await loadState();
  
  // Initialize
  await initBluesky();
  
  // Do initial check
  await pollAndPost();
  
  // Set up recurring checks
  const intervalMs = CONFIG.pollIntervalMinutes * 60 * 1000;
  setInterval(pollAndPost, intervalMs);
  
  console.log(`\n✓ Bot running! Checking every ${CONFIG.pollIntervalMinutes} minutes`);
  console.log('Press Ctrl+C to stop\n');
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down bot...');
  await saveState();
  process.exit(0);
});

// Run the bot
start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
