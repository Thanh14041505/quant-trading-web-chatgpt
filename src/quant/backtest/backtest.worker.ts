import { runBacktest } from "./backtest-engine"
import type { BacktestWorkerRequest, BacktestWorkerResponse } from "./types"

const workerContext = self as unknown as {
  onmessage: ((event: { data: BacktestWorkerRequest }) => void) | null
  postMessage: (message: BacktestWorkerResponse) => void
}

workerContext.onmessage = (event) => {
  const message = event.data
  if (message.type !== "RUN") return
  try {
    const result = runBacktest(message.input, (progress) => {
      workerContext.postMessage({ type: "PROGRESS", requestId: message.requestId, progress })
    })
    workerContext.postMessage({ type: "RESULT", requestId: message.requestId, result })
  } catch (error) {
    workerContext.postMessage({
      type: "ERROR",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
