# Defense Console — customizable personal security checklist dashboard.
# Build: docker build -t defense-console .   Run: docker run -p 8080:8080 defense-console

FROM node:22-alpine AS build
WORKDIR /repo/dashboard
COPY dashboard/package.json dashboard/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
COPY personal-security-checklist.yml /repo/
COPY web/src/components/core/icon.tsx /repo/web/src/components/core/icon.tsx
COPY dashboard/ ./
RUN node build.mjs

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/dashboard/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
