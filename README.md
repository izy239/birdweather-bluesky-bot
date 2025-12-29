# BirdWeather to Bluesky Bot

Automatically posts bird detections from your BirdNET-PI station to Bluesky with beautiful images from Flickr.

## Features

- 🐦 Posts bird detections with species name, confidence, and timestamp
- 📷 Includes beautiful bird photos from Flickr with photographer credit
- 🔗 Clickable hashtags (#SpeciesName #BirdNET)
- 🔊 Optional links to BirdWeather detection audio
- ⏰ Configurable timezone support
- 🐳 Docker-based for easy deployment
- 💾 Persistent state across restarts

## Prerequisites

- Docker and Docker Compose installed
- A [BirdWeather](https://birdweather.com) station with BirdNET-PI
- A [Bluesky](https://bsky.app) account for posting
- A free [Flickr API key](https://www.flickr.com/services/apps/create/apply/)

## Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/izy239/birdweather-bluesky-bot.git
cd birdweather-bluesky-bot
```

2. **Create `.env` file with your credentials**
```bash
cat > .env << 'EOL'
STATION_ID=your_station_id
BIRDWEATHER_TOKEN=your_birdweather_token
BLUESKY_HANDLE=your-bot.bsky.social
BLUESKY_APP_PASSWORD=your_app_password
FLICKR_API_KEY=your_flickr_api_key
EOL
```

3. **Configure optional settings in `docker-compose.yml`**
```yaml
environment:
  - TIMEZONE=America/New_York           # Your timezone
  - POLL_INTERVAL_MINUTES=15           # How often to check (minutes)
  - MIN_CONFIDENCE=0.7                 # Minimum confidence (0.0-1.0)
  - INCLUDE_LINK=true                  # Include BirdWeather link
  - INCLUDE_IMAGE=true                 # Include Flickr images
```

4. **Start the bot**
```bash
docker compose up -d
```

5. **View logs**
```bash
docker compose logs -f
```

## Configuration

### Getting Your Credentials

**Station ID:**
- Find it in your BirdWeather station URL: `https://app.birdweather.com/stations/XXXXX`
- Add to `.env` file

**BirdWeather Token:**
- Go to your station at https://app.birdweather.com/stations/YOUR_ID
- Find your station token in settings
- Add to `.env` file

**Bluesky App Password:**
- Go to Bluesky Settings → App Passwords
- Create a new app password (don't use your main password!)
- Add to `.env` file

**Flickr API Key:**
- Apply at https://www.flickr.com/services/apps/create/apply/
- Choose "Non-Commercial" (it's free and instant)
- Add to `.env` file

### Timezone Options

Use standard IANA timezone names:
- `America/New_York` (EST/EDT)
- `America/Chicago` (CST/CDT)
- `America/Los_Angeles` (PST/PDT)
- `Europe/London` (GMT/BST)
- `UTC` (Universal Time)

[Full list of timezones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

## Usage

### Run a test post
```bash
docker compose run --rm birdweather-bot node test.js
```

### Restart the bot
```bash
docker compose restart
```

### Stop the bot
```bash
docker compose down
```

### Reset state (start fresh)
```bash
rm -rf data/
docker compose restart
```

## Example Post
```
🐦 Blue Jay detected!

Confidence: 85%
Time: Dec 29, 2025, 10:30 AM EST

#BlueJay #BirdNET

🔊 Listen: app.birdweather.com/detections/...

📷 Photo: photographer_name (Flickr)
```

## Troubleshooting

**No posts appearing?**
- Check if birds have been detected with sufficient confidence
- Verify your BirdWeather token is correct
- Check logs: `docker compose logs -f`

**Hashtags/links not clickable?**
- Make sure you're running the latest version
- Rebuild: `docker compose build --no-cache`

**Bot keeps restarting?**
- Check credentials in `.env` file
- View error logs: `docker compose logs`

## Development

### Project Structure
```
birdweather-bluesky-bot/
├── bot.js              # Main bot logic
├── test.js             # Test script
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose config
├── package.json        # Node.js dependencies
├── .env               # Your credentials (not committed)
├── .gitignore         # Git ignore rules
└── data/              # Persistent state (not committed)
```

### Making Updates

After making changes to the code:
```bash
docker compose down
docker compose build
docker compose up -d
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use and modify!

## Credits

- Built with [@atproto/api](https://github.com/bluesky-social/atproto) for Bluesky
- Uses [BirdNET](https://birdnet.cornell.edu/) for bird detection
- Images from [Flickr](https://www.flickr.com/) under Creative Commons licenses
- Powered by [BirdWeather](https://birdweather.com/)

## Support

If you find this useful, consider:
- ⭐ Starring the repository
- 🐦 Sharing your bot account
- 🐛 Reporting issues or suggesting features

---

Made with ❤️ for bird enthusiasts
