'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pill, Delete, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { staffApi } from '@/lib/apiClient'
import { useBillingStore } from '@/store/billingStore'
import { useAuthStore } from '@/store/authStore'

export function StaffPinEntry() {
    const [pinDigits, setPinDigits] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSuccess, setIsSuccess] = useState(false)
    const [isShaking, setIsShaking] = useState(false)
    
    const user = useAuthStore(state => state.user)
    const { setActiveStaff } = useBillingStore()

    const verifyPin = useCallback(async (pin: string) => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await staffApi.lookupByPin(pin, user?.outletId ?? '')
            setIsSuccess(true)
            setTimeout(() => {
                setActiveStaff(response)
            }, 500)
        } catch (err: any) {
            setError(err?.error?.message ?? "Invalid PIN. Please try again.")
            setIsShaking(true)
            setTimeout(() => setIsShaking(false), 600)
            setTimeout(() => setPinDigits([]), 600)
        } finally {
            setIsLoading(false)
        }
    }, [setActiveStaff, user])

    const handleInput = useCallback((key: string) => {
        if (isLoading || isSuccess) return

        if (key === 'Backspace') {
            setPinDigits(prev => prev.slice(0, -1))
            setError(null)
        } else if (key === 'Escape') {
            setPinDigits([])
            setError(null)
        } else if (/^\d$/.test(key) && pinDigits.length < 4) {
            setPinDigits(prev => {
                const newDigits = [...prev, key]
                if (newDigits.length === 4) {
                    verifyPin(newDigits.join(''))
                }
                return newDigits
            })
            setError(null)
        }
    }, [pinDigits, isLoading, isSuccess, verifyPin])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            handleInput(e.key)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleInput])

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center relative overflow-hidden">
                {isSuccess && (
                    <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center animate-in fade-in duration-300">
                        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4 animate-bounce" />
                        <p className="text-xl font-semibold text-slate-900">Verified</p>
                    </div>
                )}
                
                <div className="flex flex-col items-center">
                    <div className="bg-primary/10 p-3 rounded-full mb-4">
                        <Pill className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900">Enter Your PIN</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        4-digit staff PIN to start billing session
                    </p>
                </div>

                <div className={cn("flex gap-3 justify-center mt-6", isShaking && "animate-shake")}>
                    {[0, 1, 2, 3].map((index) => {
                        const isActive = pinDigits.length === index;
                        const isFilled = pinDigits.length > index;
                        return (
                            <div 
                                key={index} 
                                className={cn(
                                    "w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                                    isFilled ? "border-primary bg-primary" : "border-slate-300 bg-slate-50",
                                    isActive && !isLoading && !isSuccess ? "border-primary/60 scale-110 shadow-[0_0_10px_rgba(var(--primary),0.3)] animate-pulse" : ""
                                )}
                            >
                                {isFilled && <div className="w-3 h-3 rounded-full bg-white animate-in zoom-in" />}
                            </div>
                        )
                    })}
                </div>

                <div className="h-6 mt-3">
                    {error && <p className="text-sm text-red-600 animate-in fade-in">{error}</p>}
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                            key={num}
                            onClick={() => handleInput(num.toString())}
                            disabled={isLoading || isSuccess}
                            className="w-full h-14 rounded-xl text-xl font-semibold bg-slate-100 hover:bg-slate-200 active:scale-95 transition-transform text-slate-900 flex items-center justify-center select-none"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={() => handleInput('Escape')}
                        disabled={isLoading || isSuccess}
                        className="w-full h-14 rounded-xl text-xl font-semibold bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 transition-transform flex items-center justify-center select-none"
                    >
                        ×
                    </button>
                    <button
                        onClick={() => handleInput('0')}
                        disabled={isLoading || isSuccess}
                        className="w-full h-14 rounded-xl text-xl font-semibold bg-slate-100 hover:bg-slate-200 active:scale-95 transition-transform text-slate-900 flex items-center justify-center select-none"
                    >
                        0
                    </button>
                    <button
                        onClick={() => handleInput('Backspace')}
                        disabled={isLoading || isSuccess}
                        className="w-full h-14 rounded-xl text-xl font-semibold bg-slate-100 hover:bg-slate-200 active:scale-95 transition-transform text-slate-600 flex items-center justify-center select-none"
                    >
                        <Delete className="w-6 h-6" />
                    </button>
                </div>

                <div className="mt-8 flex items-center justify-between text-sm px-2">
                    <span className="text-slate-400 cursor-not-allowed">Switch Outlet</span>
                    {user && (
                        <div className="flex items-center gap-2 text-slate-500">
                            Logged in as <span className="font-medium text-slate-700">{user.name}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
