import axios from 'axios';

export interface NewsItem {
    kind: string;
    domain: string;
    title: string;
    published_at: string;
    slug: string;
    url: string;
    votes: {
        negative: number;
        positive: number;
        important: number;
        liked: number;
        disliked: number;
        lol: number;
        toxic: number;
        saved: number;
        comments: number;
    };
}

export class SentimentAnalyzer {
    private apiKey: string;
    private apiUrl = 'https://cryptopanic.com/api/v1/posts/';

    constructor() {
        this.apiKey = process.env.CRYPTOPANIC_API_TOKEN || '';
        if (!this.apiKey) {
            console.warn("⚠️ No CRYPTOPANIC_API_TOKEN found. Sentiment analysis will be disabled.");
        }
    }

    async getLatestNews(filter: 'rising' | 'hot' | 'bullish' | 'bearish' = 'rising'): Promise<NewsItem[]> {
        if (!this.apiKey) return [];

        try {
            const response = await axios.get(this.apiUrl, {
                params: {
                    auth_token: this.apiKey,
                    filter: filter,
                    kind: 'news',
                    public: true
                }
            });

            if (response.data && response.data.results) {
                return response.data.results as NewsItem[];
            }
            return [];
        } catch (e: any) {
            console.error("❌ Failed to fetch CryptoPanic news:", e.message);
            return [];
        }
    }

    async analyzeMarketSentiment(): Promise<'BULLISH' | 'BEARISH' | 'NEUTRAL'> {
        const news = await this.getLatestNews('rising');
        if (news.length === 0) return 'NEUTRAL';

        let bullishScore = 0;
        let bearishScore = 0;

        // Simple Vote-based Sentiment Scoring
        news.forEach(item => {
            if (item.votes.positive > item.votes.negative) {
                bullishScore += (item.votes.positive + item.votes.important);
            } else {
                bearishScore += (item.votes.negative + item.votes.toxic);
            }
        });

        console.log(`📊 Market Sentiment Score - Bull: ${bullishScore}, Bear: ${bearishScore}`);

        if (bullishScore > bearishScore * 1.5) return 'BULLISH';
        if (bearishScore > bullishScore * 1.5) return 'BEARISH';
        return 'NEUTRAL';
    }
}
