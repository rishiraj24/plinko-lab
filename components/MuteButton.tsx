// components/MuteButton.tsx

'use client'

import { useState, useEffect } from 'react'
import { audioService } from '@/lib/audio/AudioService'

const STORAGE_KEY = 'plinko-muted'

export default function MuteButton() {
    const [muted, setMuted] = useState(false)

    // Restore persisted preference on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored === 'true') {
            // Initialise service in muted state (no AudioContext yet — that's fine)
            audioService.init()
            audioService.toggleMute()
            setMuted(true)
        }
    }, [])

    function handleToggle() {
        audioService.init()   // safe to call repeatedly — no-ops after first call
        const nowMuted = audioService.toggleMute()
        setMuted(nowMuted)
        localStorage.setItem(STORAGE_KEY, String(nowMuted))
    }

    return (
        <button
            onClick={handleToggle}
            className="mute-btn"
            aria-label={muted ? 'Unmute game sounds' : 'Mute game sounds'}
            aria-pressed={muted}
            title={muted ? 'Unmute' : 'Mute'}
        >
            {muted ? '🔇' : '🔊'}
        </button>
    )
}