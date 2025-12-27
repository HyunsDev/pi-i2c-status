# --------------------------------------------------------
# 1. 빌드 스테이지 (필요한 도구 다 설치해서 빌드)
# --------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# pnpm 활성화
RUN corepack enable

# 빌드에 필요한 도구 설치 (Alpine 패키지 관리자 apk 사용)
# python3, make, g++: i2c-bus 네이티브 모듈 컴파일용
# linux-headers: 하드웨어 접근용 헤더
RUN apk add --no-cache python3 make g++ linux-headers

# 의존성 설치
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 소스 빌드
COPY . .
RUN pnpm run build

# 프로덕션용 node_modules만 남기기 (개발 의존성 제거)
RUN pnpm prune --prod

# --------------------------------------------------------
# 2. 실행 스테이지 (최소한의 파일만 복사)
# --------------------------------------------------------
FROM node:20-alpine
WORKDIR /app

# 실행 시 하드웨어 디버깅용 툴만 설치 (아주 작음)
# (파이썬, 컴파일러 등 무거운 건 뺌)
RUN apk add --no-cache i2c-tools

# 빌드 결과물 복사
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]