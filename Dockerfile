FROM oven/bun:1-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a
WORKDIR /app
COPY --chown=bun:bun . .
ENV PORT=3000
ENV PUBLIC_DIR=./public
EXPOSE 3000
USER bun
CMD ["bun", "server.js"]
