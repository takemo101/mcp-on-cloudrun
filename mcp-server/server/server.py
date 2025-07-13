import asyncio
import logging
import os
from typing import Any, Literal, TypedDict

import httpx
from fastmcp import FastMCP

logger = logging.getLogger(__name__)
logging.basicConfig(format='[%(levelname)s]: %(message)s', level=logging.INFO)

# Create server
mcp = FastMCP(name='Zenn MCP Server', stateless_http=True)

ZENN_ENDPOINT = 'https://zenn.dev/api/articles'


# Zenn記事リストの型定義
class ZennArticles(TypedDict):
    articles: list[dict[str, Any]]


@mcp.tool
async def get_zenn_posts_by_username(
    username: str,
    count: int = 20,
    # ここは型エイリアスを使いたいところですが、MCPクライアントから参照できないためLiteralを使用
    order: Literal[
        'latest', 'daily', 'weekly', 'monthly', 'alltime'
    ] = 'latest',
) -> ZennArticles:
    """
    対象のZennユーザーの投稿を取得するツール。
    Args:
        username (str): Zennのユーザー名
        count (int): 取得する投稿の数（デフォルトは20）
        order (Literal['latest', 'daily', 'weekly', 'monthly', 'alltime']): 投稿の並び順（デフォルトは'latest'）latest, daily, weekly, monthly, alltime の文字列から選択可能
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f'{ZENN_ENDPOINT}?username={username}&count={count}&order={order}'
        )
        response.raise_for_status()

    logger.info(f'Fetched posts for user: {username}')
    logger.debug(f'Response data: {response.json()}')
    return response.json()


@mcp.tool
async def get_zenn_posts_by_topic(
    topicname: str,
    count: int = 20,
    order: Literal[
        'latest', 'daily', 'weekly', 'monthly', 'alltime'
    ] = 'latest',
) -> ZennArticles:
    """
    対象のZennの技術トピックの投稿を取得するツール。
    Args:
        topicname (str): Zennの技術トピック名 e.g. "Python", "JavaScript"
        count (int): 取得する投稿の数（デフォルトは20）
        order (Literal['latest', 'daily', 'weekly', 'monthly', 'alltime']): 投稿の並び順（デフォルトは'latest'）latest, daily, weekly, monthly, alltime の文字列から選択可能
    """

    # Zennのトピック名はスペースを含むことがあるため、スペースを削除
    # 小文字化も行う
    sanitized_topicname = topicname.replace(' ', '').lower()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f'{ZENN_ENDPOINT}?topicname={sanitized_topicname}&count={count}&order={order}'
        )
        response.raise_for_status()

    logger.info(f'Fetched posts for topic: {topicname}')
    logger.debug(f'Response data: {response.json()}')
    return response.json()


def main():
    """Main entry point for the MCP server."""
    asyncio.run(
        mcp.run_http_async(
            host='0.0.0.0',
            port=int(os.getenv('PORT', 8080)),
            path='/mcp',
        )
    )


if __name__ == '__main__':
    main()
