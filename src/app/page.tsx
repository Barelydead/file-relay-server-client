"use client";

import { env } from "process";
import { useEffect, useState } from "react";

type IncomingFile = {
  fileId: string;
  name: string;
  mimeType: string;
  totalChunks: number;
  receivedChunks: Uint8Array[];
  chunksReceived: number;
};

export default function FileTransferApp() {
  const [connection, setConnection] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});
  const [incomingFiles, setIncomingFiles] = useState<
    Record<string, IncomingFile>
  >({});
  const [downloads, setDownloads] = useState<
    Record<string, { name: string; url: string }>
  >({});

  useEffect(() => {
    const ws = new WebSocket(
      `ws://${process.env.NEXT_PUBLIC_SERVER_BASE_URL}/ws/room-1`,
    );

    ws.onopen = () => {
      setConnected(true);
      setConnection(ws);
    };

    ws.onclose = () => {
      setConnected(false);
      setConnection(null);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "filechunk") {
        const chunk = JSON.parse(message.data);
        const { fileId, name, mimeType, chunkIndex, totalChunks, data } = chunk;

        setIncomingFiles((prev) => {
          const existing = prev[fileId] ?? {
            fileId,
            name,
            mimeType,
            totalChunks,
            receivedChunks: [],
            chunksReceived: 0,
          };

          existing.receivedChunks[chunkIndex] = new Uint8Array(data);
          existing.chunksReceived++;

          // Update progress bar
          setFileProgress((p) => ({
            ...p,
            [fileId]: Math.min(
              (existing.chunksReceived / totalChunks) * 100,
              100,
            ),
          }));

          // If complete, reconstruct Blob
          if (existing.chunksReceived === totalChunks) {
            // Ignore ts
            // @ts-ignore
            const blob = new Blob(existing.receivedChunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            setDownloads((d) => ({
              ...d,
              [fileId]: { name, url },
            }));
          }

          return {
            ...prev,
            [fileId]: existing,
          };
        });
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !connection) return;

    const chunkSize = 64 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const fileId = `${file.name}-${Date.now()}`;
    let currentChunk = 0;

    const reader = new FileReader();

    const readNextChunk = () => {
      const start = currentChunk * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const blob = file.slice(start, end);
      reader.readAsArrayBuffer(blob);
    };

    reader.onload = () => {
      const chunk = new Uint8Array(reader.result as ArrayBuffer);

      const message = {
        type: "filechunk",
        data: JSON.stringify({
          fileId,
          name: file.name,
          mimeType: file.type,
          chunkIndex: currentChunk,
          totalChunks,
          data: Array.from(chunk),
        }),
      };

      connection.send(JSON.stringify(message));

      currentChunk++;
      setFileProgress((p) => ({
        ...p,
        [fileId]: (currentChunk / totalChunks) * 100,
      }));

      if (currentChunk < totalChunks) {
        readNextChunk();
      }
    };

    readNextChunk();
  };

  return (
    <div className="max-w-xl mx-auto p-6 text-gray-800">
      <h1 className="text-3xl font-bold mb-4 text-center">📁 File Transfer</h1>

      <div
        className={`text-center text-sm font-semibold py-2 mb-6 rounded ${
          connected ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
        }`}
      >
        {connected ? "Connected to server ✅" : "Disconnected ⛔"}
      </div>

      <input
        type="file"
        onChange={handleFileUpload}
        className="w-full mb-6 block text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />

      {/* Upload & Download Progress */}
      <div className="space-y-4">
        {Object.entries(fileProgress).map(([fileId, progress]) => {
          const name = incomingFiles[fileId]?.name || downloads[fileId]?.name ||
            "Uploading...";
          return (
            <div key={fileId}>
              <div className="flex justify-between mb-1 text-sm font-medium">
                <span>{name}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed Downloads */}
      {Object.entries(downloads).length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">📥 Downloaded Files:</h2>
          <ul className="space-y-2">
            {Object.entries(downloads).map(([id, { name, url }]) => (
              <li key={id}>
                <a
                  href={url}
                  download={name}
                  className="text-blue-600 hover:underline text-sm font-medium"
                >
                  ⬇️ Download {name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
