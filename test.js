import { AtpAgent } from '@atproto/api';
import fetch from 'node-fetch';

const CONFIG = {
  stationId: process.env.STATION_ID || '17550',
  birdweatherToken: process.env.BIRDWEATHER_TOKEN,
  blueskyHandle: process.env.BLUESKY_HANDLE,
  blueskyAppPassword: process.env.BLUESKY_APP_PASSWORD,
  flickrApiKey: process.env.FLICKR_API_KEY,
  includeLink: process.env.INCLUDE_LINK !== 'false',
  includeImage: process.env.INCLUDE_IMAGE !== 'false',
  timezone: process.env.TIMEZONE || 'America/New_York',
};

let agent = null;

async function initBluesky() {
  agent = new AtpAgent({ service: 'https://bsky.social' });
  await agent.login({
    identifier: CONFIG.blueskyHandle,
    password: CONFIG.blueskyAppPassword,
  });
  console.log('✓ Logged into Bluesky');
}

async function fetchBirdImage(birdName) {
  if (!CONFIG.flickrApiKey || !CONFIG.includeImage) {
    return null;
  }

  try {
    const searchUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${CONFIG.flickrApiKey}&text=${encodeURIComponent(birdName)}&license=1,2,3,4,5,6,9,10&content_type=1&media=photos&per_page=5&format=json&nojsoncallback=1&sort=relevance`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.photos && data.photos.photo && data.photos.photo.length > 0) {
      const photo = data.photos.photo[Math.floor(Math.random() * Math.min(5, data.photos.photo.length))];
      
      const infoUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.getInfo&api_key=${CONFIG.flickrApiKey}&photo_id=${photo.id}&format=json&nojsoncallback=1`;
      const infoResponse = await fetch(infoUrl);
      const infoData = await infoResponse.json();
      
      const photographer = infoData.photo?.owner?.username || infoData.photo?.owner?.realname || 'Unknown';
      const photoUrl = `https://www.flickr.com/photos/${photo.owner}/${photo.id}`;
      
      const imageUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_b.jpg`;
      
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

async function postTestDetection(detection) {
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
  
  const hashtag = species.replace(/[^a-zA-Z0-9]/g, '');
  
  let postText = `🐦 ${species} detected!\n\n`;
  postText += `Confidence: ${confidence}%\n`;
  postText += `Time: ${time} ${timeZone}\n\n`;
  postText += `#${hashtag} #BirdNET`;
  
  if (CONFIG.includeLink && detection.id) {
    postText += `\n\n🔊 Listen: https://app.birdweather.com/detections/${detection.id}`;
  }
  
  try {
    const image = await fetchBirdImage(species);
    
    if (image && image.photographer) {
      postText += `\n\n📷 Photo: ${image.photographer} (Flickr)`;
    }
    
    const encoder = new TextEncoder();
    const facets = [];
    
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
    
    // Add facet for Flickr photographer link
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

async function test() {
  console.log('🧪 Running test post...\n');
  
  if (!CONFIG.birdweatherToken || !CONFIG.blueskyAppPassword) {
    console.error('❌ Missing required environment variables!');
    process.exit(1);
  }
  
  await initBluesky();
  
  console.log('Fetching latest detection from BirdWeather...\n');
  
  const url = `https://app.birdweather.com/api/v1/stations/${CONFIG.stationId}/detections?limit=1`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CONFIG.birdweatherToken}`
    }
  });
  
  const data = await response.json();
  
  if (!data.detections || data.detections.length === 0) {
    console.error('❌ No detections found on your station');
    process.exit(1);
  }
  
  const detection = data.detections[0];
  console.log(`Found: ${detection.species?.commonName || 'Unknown'} (${Math.round(detection.confidence * 100)}%)\n`);
  
  await postTestDetection(detection);
  
  console.log('\n✅ Test complete!');
}

test().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
