# Revenant Reader — production image (Vultr fallback deploy, task 29).
# Node 24 (the app uses the built-in node:sqlite module) + Next.js 16.
# Build the image, then run with a host volume on /app/data so the SQLite
# file survives container restarts and redeploys (Req 7 AC2):
#   docker build -t revenant-reader .
#   docker run -d --name revenant-reader --restart unless-stopped \
#     -p 3000:3000 -v /root/revenant-reader-data:/app/data \
#     -e REFRESH_INTERVAL_MINUTES=30 revenant-reader
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
