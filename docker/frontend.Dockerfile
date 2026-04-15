FROM node:20-alpine

WORKDIR /app

# Layer 1: manifests only (for npm install cache)
COPY package.json package-lock.json ./
COPY packages/constants/package.json ./packages/constants/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json

# Full workspace install
RUN npm install
# Remove workspace-level react/react-dom duplicates.
# npm puts copies in both /app/node_modules and /app/apps/frontend/node_modules.
# styled-jsx (bundled in Next.js) uses the root copy; react-dom-server uses whichever
# is found first. Removing workspace copies forces all SSR code to the same instance.
RUN rm -rf /app/apps/frontend/node_modules/react /app/apps/frontend/node_modules/react-dom

# Layer 2: source
COPY packages/constants/ ./packages/constants/
COPY packages/types/ ./packages/types/
COPY apps/frontend/ ./apps/frontend/

WORKDIR /app/apps/frontend

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
