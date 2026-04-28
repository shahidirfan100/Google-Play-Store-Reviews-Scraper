# Google Play Store Reviews Scraper

Collect Google Play app reviews at scale using a direct app URL or package ID. Build clean review datasets for sentiment analysis, quality monitoring, competitor tracking, and customer feedback workflows. Results are normalized for downstream analytics and export.

## Features

- **Flexible app targeting** — Use a Google Play URL or package ID.
- **Review pagination** — Collect across multiple pages up to your configured limits.
- **Configurable sorting** — Pull newest, most helpful, or rating-ordered reviews.
- **Locale support** — Set `lang` and `country` for market-specific review retrieval.
- **Clean datasets** — Null and empty values are excluded from output items.
- **Deduplicated records** — Prevents duplicate reviews in the final dataset.

## Use Cases

### Product Feedback Monitoring
Track recent customer complaints, bugs, and feature requests. Prioritize fixes based on recurring review themes.

### Competitor Intelligence
Collect reviews for competing apps and compare pain points, satisfaction, and release impact over time.

### Sentiment And Topic Analysis
Export review text for NLP pipelines, sentiment scoring, or issue clustering across regions and app versions.

### Customer Support Insights
Capture developer replies and response timing to evaluate support quality and communication patterns.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | String | No | `https://play.google.com/store/apps/details?id=com.linkedin.android&hl=en&gl=US` | Google Play app URL or package ID |
| `results_wanted` | Integer | No | `20` | Maximum number of reviews to collect |
| `max_pages` | Integer | No | `10` | Maximum number of pages to fetch |
| `sort` | String | No | `newest` | Review order: `newest`, `helpfulness`, `rating` |
| `lang` | String | No | `en` | Language code |
| `country` | String | No | `us` | Country code |
| `proxyConfiguration` | Object | No | Apify Proxy enabled | Proxy settings for reliable large runs |

---

## Output Data

Each dataset item can include the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `appId` | String | Google Play package ID |
| `appUrl` | String | Google Play app URL |
| `reviewId` | String | Unique review identifier |
| `reviewUrl` | String | Direct URL to the review |
| `userName` | String | Reviewer display name |
| `userImage` | String | Reviewer avatar URL |
| `reviewerId` | String | Reviewer account identifier |
| `score` | Integer | Review rating (1-5) |
| `scoreText` | String | Rating represented as text |
| `text` | String | Review message |
| `thumbsUpCount` | Integer | Number of likes on the review |
| `reviewCreatedVersion` | String | App version used by reviewer |
| `at` | String | Review timestamp (ISO-8601) |
| `replyAuthorName` | String | Developer reply author |
| `replyText` | String | Developer reply content |
| `repliedAt` | String | Reply timestamp (ISO-8601) |
| `criteriaRatings` | Array | Additional per-topic ratings when available |
| `lang` | String | Language used in the run |
| `country` | String | Country used in the run |
| `sort` | String | Sort mode used in the run |
| `sourceUrl` | String | Input URL used for app resolution |

---

## Usage Examples

### Basic URL Run

Collect the newest 20 reviews from a known app URL.

```json
{
    "url": "https://play.google.com/store/apps/details?id=com.linkedin.android&hl=en&gl=US",
    "results_wanted": 20,
    "max_pages": 3,
    "sort": "newest",
    "lang": "en",
    "country": "us"
}
```

### Market-Specific Collection

Collect German-market reviews for the same app.

```json
{
    "url": "https://play.google.com/store/apps/details?id=com.linkedin.android",
    "results_wanted": 40,
    "max_pages": 4,
    "sort": "rating",
    "lang": "de",
    "country": "de"
}
```

---

## Sample Output

```json
{
    "appId": "com.linkedin.android",
    "appUrl": "https://play.google.com/store/apps/details?id=com.linkedin.android",
    "reviewId": "c38217fd-526c-4d90-8c85-8bf2ec1ee9d1",
    "reviewUrl": "https://play.google.com/store/apps/details?id=com.linkedin.android&reviewId=c38217fd-526c-4d90-8c85-8bf2ec1ee9d1",
    "userName": "Erik Lentz",
    "score": 1,
    "scoreText": "1",
    "text": "Way too many notifications and the notification menu is a labyrinth...",
    "thumbsUpCount": 47,
    "reviewCreatedVersion": "4.1.1188",
    "at": "2026-04-06T06:49:19.136Z",
    "lang": "en",
    "country": "us",
    "sort": "newest"
}
```

---

## Tips for Best Results

### Choose A Precise Input
- Use a direct app URL or package ID.

### Balance Speed And Coverage
- Start with `results_wanted: 20` for quick validation.
- Increase `max_pages` gradually for larger datasets.

### Use Locale Strategically
- Set `lang` and `country` for region-specific customer sentiment.
- Run multiple locale combinations for global analysis.

### Keep Runs Stable
- Use proxy configuration for larger or frequent runs.
- Schedule periodic runs instead of one huge run when monitoring trends.

---

## Integrations

Connect your dataset with:

- **Google Sheets** — Build live review trackers.
- **Airtable** — Organize review workflows and triage queues.
- **Slack** — Send alerts for negative trends.
- **Webhooks** — Push run outputs into internal systems.
- **Make** — Automate no-code review pipelines.
- **Zapier** — Trigger downstream actions from completed runs.

### Export Formats

- **JSON** — Best for APIs and analytics pipelines.
- **CSV** — Spreadsheet-friendly exports.
- **Excel** — Reporting and stakeholder sharing.
- **XML** — Legacy system integrations.

---

## Frequently Asked Questions

### Can I use a package ID instead of a full URL?
Yes. You can pass a package ID such as `com.linkedin.android` in the `url` field.

### Why are some fields missing on some reviews?
Google Play does not provide every field for every review. Empty and null values are omitted from output.

### Can I collect more than 20 reviews?
Yes. Increase `results_wanted` and `max_pages` according to your use case.

### Does this support different countries and languages?
Yes. Use `lang` and `country` to fetch localized review streams.

### How do I avoid duplicate reviews?
The actor deduplicates by `reviewId` within each run.

---

## Support

For issues or feature requests, open a discussion in the actor repository or contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Scheduling](https://docs.apify.com/schedules)

---

## Legal Notice

This actor is intended for lawful data collection and analysis. You are responsible for complying with Google Play terms, local laws, and all applicable data-use requirements in your jurisdiction.
