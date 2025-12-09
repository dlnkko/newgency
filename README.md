This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Environment Variables Setup

#### Local Development

1. Create a `.env.local` file in the root directory:
   ```bash
   touch .env.local
   ```

2. Add your API keys to `.env.local`:
   ```env
   # Google Gemini API Key
   # Get your API key from: https://aistudio.google.com/apikey
   GOOGLE_GENAI_API_KEY=your_google_genai_api_key_here

   # Firecrawl API Key
   # Get your API key from: https://firecrawl.dev
   # Note: The API key should start with 'fc-' prefix
   FIRECRAWL_API_KEY=fc-your_firecrawl_api_key_here
   ```

3. Replace the placeholder values with your actual API keys.

**Important:** The `.env.local` file is already in `.gitignore` and will not be committed to version control.

#### Vercel Deployment

When deploying to Vercel, you need to add the environment variables in the Vercel dashboard:

1. Go to your project settings in Vercel
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `GOOGLE_GENAI_API_KEY` = your Google Gemini API key
   - `FIRECRAWL_API_KEY` = your Firecrawl API key (with `fc-` prefix)

4. After adding the variables, redeploy your application.

**Note:** No quotes are needed when adding environment variables in Vercel. Just paste the API key value directly.

### Running the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
