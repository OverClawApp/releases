import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App'

Sentry.init({
  dsn: 'https://97bcefa14c7e83c31268119b790427fd@o4510920689319936.ingest.us.sentry.io/4510920749809664',
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  environment: import.meta.env.MODE,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div>Something went wrong.</div>}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
