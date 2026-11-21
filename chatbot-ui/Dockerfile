# Stage 1: Build the React app
FROM node:20-alpine AS build
WORKDIR /app

# Install exactly the versions pinned in package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

COPY . ./

# Optional: bake a non-default API URL into the build (docker build --build-arg REACT_APP_API_BASE_URL=...)
ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL
RUN npm run build

# Stage 2: Serve the React app using nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
