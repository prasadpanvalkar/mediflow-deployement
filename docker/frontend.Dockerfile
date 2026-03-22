FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
