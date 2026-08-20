"""
WebSocket connection manager for real-time video progress and incident notifications.
"""
import asyncio
import json
import logging
from typing import Set

from fastapi import WebSocket

logger = logging.getLogger("websocket_manager")


class WebSocketManager:
    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info("WebSocket client connected (%d active)", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)
        logger.info("WebSocket client disconnected (%d active)", len(self.active_connections))

    async def broadcast(self, message: dict) -> None:
        if not self.active_connections:
            return
        payload = json.dumps(message)
        disconnected = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception as exc:
                logger.warning("Error broadcasting to WebSocket: %s", exc)
                disconnected.add(connection)

        for conn in disconnected:
            self.disconnect(conn)

    def broadcast_sync(self, message: dict) -> None:
        """Thread-safe broadcast from synchronous threads (e.g., worker thread)."""
        if not self.active_connections:
            return
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(message), self.loop)
        else:
            try:
                loop = asyncio.get_running_loop()
                asyncio.run_coroutine_threadsafe(self.broadcast(message), loop)
            except RuntimeError:
                pass


ws_manager = WebSocketManager()
