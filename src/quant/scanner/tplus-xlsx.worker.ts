import { buildTplusXlsx } from "./tplus-xlsx"
import type { ScannerRunResult } from "./types"

type RequestMessage = { type: "BUILD"; requestId: string; result: ScannerRunResult }
type ResponseMessage =
  | { type: "SUCCESS"; requestId: string; buffer: ArrayBuffer }
  | { type: "ERROR"; requestId: string; message: string }

const workerContext = self as unknown as {
  onmessage: ((event: { data: RequestMessage }) => void) | null
  postMessage: (message: ResponseMessage, transfer?: Transferable[]) => void
}

workerContext.onmessage = (event) => {
  const message = event.data
  if (message.type !== "BUILD") return
  try {
    const bytes = buildTplusXlsx(message.result)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    workerContext.postMessage({ type: "SUCCESS", requestId: message.requestId, buffer }, [buffer])
  } catch (error) {
    workerContext.postMessage({
      type: "ERROR",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
