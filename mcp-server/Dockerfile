# 公式のPythonイメージを使用
FROM python:3.13-slim

ENV PORT=8080

# uvをインストール
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# プロジェクトを/appにインストール
COPY . /app
WORKDIR /app

# print文やログメッセージがすぐにログに出力されるようにする
ENV PYTHONUNBUFFERED=1

# 依存関係をインストール
RUN uv sync --frozen

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE $PORT

# FastMCPサーバーを実行
CMD ["uv", "run", "server"]
