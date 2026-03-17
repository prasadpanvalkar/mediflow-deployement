'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useKioskCheckIn, useKioskCheckOut, useTodayAttendance } from '@/hooks/useAttendance';
import { staffApi } from '@/lib/apiClient';
import { useOutletSettings } from '@/hooks/useOutletSettings';
import { StaffMember, AttendanceRecord } from '@/types';
import {
    Building2, LogIn, LogOut, Lock, CheckCircle2,
    XCircle, Loader2, Clock, ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/shared/RoleBadge';

type KioskStep = 'idle' | 'pin_entry' | 'photo' | 'processing' | 'success' | 'error';
type ActionType = 'check_in' | 'check_out';

interface Props {
    onExit: () => void;
}

// Lazily loaded webcam component (client-only, avoids SSR issues)
let WebcamLib: any = null;

function WebcamCapture({ webcamRef, onError }: { webcamRef: React.MutableRefObject<any>; onError: () => void }) {
    const [Cam, setCam] = useState<any>(null);
    useEffect(() => {
        if (WebcamLib) { setCam(() => WebcamLib); return; }
        import('react-webcam').then(m => {
            WebcamLib = m.default;
            setCam(() => WebcamLib);
        }).catch(onError);
    }, []);

    if (!Cam) return (
        <div className="w-80 h-60 rounded-2xl border-4 border-slate-600 bg-slate-800 flex items-center justify-center">
            <div className="text-slate-400 text-sm">Loading camera...</div>
        </div>
    );

    return (
        <Cam
            ref={webcamRef}
            width={320}
            height={240}
            screenshotFormat="image/jpeg"
            mirrored={true}
            onUserMediaError={onError}
            className="rounded-2xl border-4 border-slate-600"
        />
    );
}

export function KioskMode({ onExit }: Props) {
    const { outlet } = useAuthStore();
    const { kioskPhotoCapture, kioskAutoResetSeconds } = useSettingsStore();
    const { data: outletSettings } = useOutletSettings();

    const [step, setStep] = useState<KioskStep>('idle');
    const [actionType, setActionType] = useState<ActionType>('check_in');
    const [enteredPin, setEnteredPin] = useState('');
    const [identifiedStaff, setIdentifiedStaff] = useState<StaffMember | null>(null);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [currentRecord, setCurrentRecord] = useState<AttendanceRecord | null>(null);
    const [autoResetTimer, setAutoResetTimer] = useState(kioskAutoResetSeconds);
    const [shake, setShake] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [webcamAvailable, setWebcamAvailable] = useState(true);
    const [photoCountdown, setPhotoCountdown] = useState(3);
    const [exitPinMode, setExitPinMode] = useState(false);
    const [exitPin, setExitPin] = useState('');

    const [mounted, setMounted] = useState(false);
    const webcamRef = useRef<any>(null);

    useEffect(() => setMounted(true), []);
    const checkIn = useKioskCheckIn();
    const checkOut = useKioskCheckOut();
    const { data: todayRecords } = useTodayAttendance();

    // Fullscreen
    useEffect(() => {
        document.documentElement.requestFullscreen?.().catch(() => {});
        return () => {
            document.exitFullscreen?.().catch(() => {});
        };
    }, []);

    // Live clock
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Keyboard input
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (step !== 'pin_entry') return;
            if (e.key >= '0' && e.key <= '9') appendDigit(e.key);
            else if (e.key === 'Backspace') removeDigit();
            else if (e.key === 'Escape') { setStep('idle'); setEnteredPin(''); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, enteredPin]);

    // Auto-reset countdown on success/error
    useEffect(() => {
        if (step !== 'success' && step !== 'error') return;
        setAutoResetTimer(kioskAutoResetSeconds);
        const tick = setInterval(() => {
            setAutoResetTimer(prev => {
                if (prev <= 1) {
                    clearInterval(tick);
                    resetToIdle();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [step]);

    // Photo auto-capture countdown
    useEffect(() => {
        if (step !== 'photo') return;
        setPhotoCountdown(3);
        const tick = setInterval(() => {
            setPhotoCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(tick);
                    captureAndProceed();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [step]);

    function resetToIdle() {
        setStep('idle');
        setEnteredPin('');
        setIdentifiedStaff(null);
        setCapturedPhoto(null);
        setErrorMessage(null);
        setCurrentRecord(null);
        setShake(false);
    }

    function appendDigit(digit: string) {
        if (enteredPin.length >= 4) return;
        const next = enteredPin + digit;
        setEnteredPin(next);
        if (next.length === 4) {
            setTimeout(() => processPin(next), 150);
        }
    }

    function removeDigit() {
        setEnteredPin(p => p.slice(0, -1));
    }

    async function processPin(pin: string) {
        if (exitPinMode) {
            const outletId = outlet?.id ?? '';
            try {
                const staffData = await staffApi.lookupByPin(pin, outletId);
                if (staffData.role === 'super_admin' || staffData.role === 'admin') {
                    setExitPinMode(false);
                    setExitPin('');
                    onExit();
                } else {
                    triggerShake();
                    setExitPin('');
                    setTimeout(() => setExitPinMode(false), 1500);
                }
            } catch {
                triggerShake();
                setExitPin('');
                setTimeout(() => setExitPinMode(false), 1500);
            }
            return;
        }

        const outletId = outlet?.id ?? '';
        try {
            // Look up staff by PIN only — returns staff details on match
            const staffData = await staffApi.lookupByPin(pin, outletId);
            setIdentifiedStaff(staffData);
            setEnteredPin('');

            if (kioskPhotoCapture) {
                setStep('photo');
            } else {
                setStep('processing');
                performAction(staffData, null);
            }
        } catch {
            // Wrong PIN or network error — shake the keypad
            triggerShake();
            setTimeout(() => setEnteredPin(''), 1000);
        }
    }

    function triggerShake() {
        setShake(true);
        setTimeout(() => setShake(false), 600);
    }

    function captureAndProceed() {
        let photo: string | null = null;
        if (webcamRef.current && webcamAvailable) {
            try {
                photo = webcamRef.current.getScreenshot();
            } catch {
                // ignore
            }
        }
        setCapturedPhoto(photo);
        setStep('processing');
        performAction(identifiedStaff!, photo);
    }

    function skipPhoto() {
        setCapturedPhoto(null);
        setStep('processing');
        performAction(identifiedStaff!, null);
    }

    async function performAction(staff: StaffMember, photo: string | null) {
        const outletId = outlet?.id ?? '';
        try {
            let record: AttendanceRecord;
            if (actionType === 'check_in') {
                record = await checkIn.mutateAsync({
                    staffId: staff.id,
                    type: 'check_in',
                    photoBase64: photo ?? undefined,
                    outletId,
                });
            } else {
                record = await checkOut.mutateAsync({
                    staffId: staff.id,
                    type: 'check_out',
                    photoBase64: photo ?? undefined,
                    outletId,
                });
            }
            setCurrentRecord(record);
            setStep('success');
        } catch (err: any) {
            const msg = err?.error?.message ?? 'Something went wrong. Please try again.';
            setErrorMessage(msg);
            setStep('error');
        }
    }

    function handleExitClick() {
        setExitPinMode(true);
        setExitPin('');
        setEnteredPin('');
        setStep('pin_entry');
    }

    // Build status strip from todayRecords — show names from attendance data
    const staffStatuses = (todayRecords ?? []).map((record: any) => ({
        id: record.staffId,
        name: record.staffName ?? record.staffId,
        record,
    }));

    // ── Render ────────────────────────────────────────────────────────────────

    if (step === 'idle') {
        return (
            <div className="fixed inset-0 bg-slate-900 text-white z-50 flex flex-col">
                {/* Top bar */}
                <div className="flex items-center justify-between px-8 pt-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="font-bold text-white">{outlet?.name ?? 'MediFlow Pharmacy'}</div>
                            <div className="text-xs text-slate-400">{outlet?.city}</div>
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-5xl font-bold font-mono tracking-wide">
                            {format(currentTime, 'HH:mm:ss')}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="text-lg text-slate-300">
                            {format(currentTime, 'EEEE, dd MMMM yyyy')}
                        </div>
                        <button
                            onClick={handleExitClick}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors"
                        >
                            <Lock className="w-3 h-3" />
                            Exit Kiosk
                        </button>
                    </div>
                </div>

                {/* Center */}
                <div className="flex flex-col items-center justify-center flex-1 gap-8">
                    <Building2 className="w-24 h-24 text-slate-700" />
                    <div className="text-center">
                        <div className="text-4xl font-bold">Mark Attendance</div>
                        <div className="text-xl text-slate-400 mt-2">
                            Enter your PIN to check in or out
                        </div>
                    </div>

                    <div className="flex gap-6">
                        <button
                            onClick={() => { setActionType('check_in'); setStep('pin_entry'); }}
                            className="w-64 h-40 rounded-3xl bg-green-500 hover:bg-green-600 active:scale-95 transition-all flex flex-col items-center justify-center gap-3 shadow-xl"
                        >
                            <LogIn className="w-12 h-12" />
                            <span className="text-2xl font-bold">Check In</span>
                        </button>
                        <button
                            onClick={() => { setActionType('check_out'); setStep('pin_entry'); }}
                            className="w-64 h-40 rounded-3xl bg-blue-500 hover:bg-blue-600 active:scale-95 transition-all flex flex-col items-center justify-center gap-3 shadow-xl"
                        >
                            <LogOut className="w-12 h-12" />
                            <span className="text-2xl font-bold">Check Out</span>
                        </button>
                    </div>

                    {/* Today's status strip */}
                    <div className="bg-slate-800 rounded-2xl px-8 py-4 flex gap-6 flex-wrap justify-center max-w-2xl">
                        {staffStatuses.map(({ id, name, record }: any) => (
                            <div key={id} className="flex flex-col items-center gap-1">
                                <Avatar className="w-10 h-10">
                                    <AvatarFallback className="bg-slate-600 text-white text-xs">
                                        {name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="text-xs text-slate-300 text-center max-w-16 leading-tight">
                                    {name.split(' ')[0]}
                                </div>
                                {record?.checkOutTime ? (
                                    <span className="text-xs text-blue-400 font-medium">
                                        ✓ Out {record.checkOutTime.slice(0, 5)}
                                    </span>
                                ) : record?.checkInTime ? (
                                    <span className="text-xs text-green-400 font-medium">
                                        ✓ In {record.checkInTime.slice(0, 5)}
                                    </span>
                                ) : (
                                    <span className="text-xs text-slate-500">—</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (step === 'pin_entry') {
        const displayPin = exitPinMode ? exitPin : enteredPin;
        const label = exitPinMode ? 'ADMIN EXIT' : actionType === 'check_in' ? 'CHECK IN' : 'CHECK OUT';
        const labelColor = exitPinMode ? 'bg-red-700 text-white' :
            actionType === 'check_in' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white';

        return (
            <div className="fixed inset-0 bg-slate-900 text-white z-50 flex flex-col items-center justify-center">
                <div className={cn(
                    'bg-slate-800 rounded-3xl p-10 max-w-sm w-full mx-4',
                    shake && 'animate-shake'
                )}>
                    <div className={cn('inline-block rounded-full px-4 py-1 text-sm font-bold mb-4', labelColor)}>
                        {label}
                    </div>
                    <div className="text-3xl font-bold text-white mt-2">
                        {exitPinMode ? 'Admin PIN Required' : 'Enter Your PIN'}
                    </div>

                    {/* PIN circles */}
                    <div className="flex gap-4 mt-6 justify-center">
                        {[0, 1, 2, 3].map(i => (
                            <div
                                key={i}
                                className={cn(
                                    'w-14 h-14 rounded-full border-2 flex items-center justify-center text-2xl',
                                    displayPin.length > i
                                        ? 'bg-primary border-primary text-white'
                                        : 'border-slate-600 bg-transparent'
                                )}
                            >
                                {displayPin.length > i ? '•' : ''}
                            </div>
                        ))}
                    </div>

                    {shake && (
                        <div className="text-red-400 text-sm text-center mt-3">
                            {exitPinMode ? 'Invalid admin PIN' : 'Invalid PIN. Try again.'}
                        </div>
                    )}

                    {/* Keypad */}
                    <div className="mt-8 grid grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <button
                                key={n}
                                onClick={() => {
                                    if (exitPinMode) {
                                        const next = exitPin + String(n);
                                        setExitPin(next);
                                        if (next.length === 4) {
                                            setTimeout(() => processPin(next), 150);
                                        }
                                    } else {
                                        appendDigit(String(n));
                                    }
                                }}
                                className="h-16 rounded-2xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-white text-2xl font-bold"
                            >
                                {n}
                            </button>
                        ))}
                        {/* Clear */}
                        <button
                            onClick={() => exitPinMode ? setExitPin('') : setEnteredPin('')}
                            className="h-16 rounded-2xl bg-red-900/50 hover:bg-red-800/50 active:scale-95 transition-all text-red-400 text-sm font-bold"
                        >
                            Clear
                        </button>
                        {/* 0 */}
                        <button
                            onClick={() => exitPinMode
                                ? (() => { const next = exitPin + '0'; setExitPin(next); if (next.length === 4) setTimeout(() => processPin(next), 150); })()
                                : appendDigit('0')
                            }
                            className="h-16 rounded-2xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-white text-2xl font-bold"
                        >
                            0
                        </button>
                        {/* Backspace */}
                        <button
                            onClick={() => exitPinMode ? setExitPin(p => p.slice(0, -1)) : removeDigit()}
                            className="h-16 rounded-2xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-white text-xl font-bold"
                        >
                            ←
                        </button>
                    </div>

                    <button
                        onClick={() => { setStep('idle'); setEnteredPin(''); setExitPinMode(false); setExitPin(''); }}
                        className="mt-6 flex items-center gap-1 text-slate-400 hover:text-white text-sm transition-colors mx-auto"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'photo' && identifiedStaff) {
        return (
            <div className="fixed inset-0 bg-slate-900 text-white z-50 flex flex-col items-center justify-center gap-6">
                <div className="text-3xl font-bold">Hello, {identifiedStaff.name}!</div>

                {/* Staff card */}
                <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                        <AvatarFallback className="bg-slate-600 text-white text-xl">
                            {identifiedStaff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="font-semibold text-lg">{identifiedStaff.name}</div>
                        <RoleBadge role={identifiedStaff.role} size="sm" />
                    </div>
                </div>

                {/* Webcam */}
                <div className="relative">
                    {webcamAvailable ? (
                        <>
                            {mounted && <WebcamCapture
                                webcamRef={webcamRef}
                                onError={() => setWebcamAvailable(false)}
                            />}
                            <div className="absolute top-2 right-2 w-12 h-12 rounded-full bg-black/70 flex items-center justify-center text-2xl font-bold text-white">
                                {photoCountdown}
                            </div>
                        </>
                    ) : (
                        <div className="w-80 h-60 rounded-2xl border-4 border-slate-600 bg-slate-800 flex flex-col items-center justify-center gap-2">
                            <div className="text-slate-400">Camera not available</div>
                            <div className="text-xs text-slate-500">Continuing without photo...</div>
                        </div>
                    )}
                </div>

                <div className="flex gap-4">
                    <Button
                        onClick={captureAndProceed}
                        className="bg-primary hover:bg-primary/90 text-white"
                    >
                        Capture Now
                    </Button>
                    <button
                        onClick={skipPhoto}
                        className="text-slate-400 hover:text-white text-sm transition-colors"
                    >
                        Skip Photo
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'processing') {
        return (
            <div className="fixed inset-0 bg-slate-900 text-white z-50 flex flex-col items-center justify-center gap-6">
                <Loader2 className="w-20 h-20 text-primary animate-spin" />
                <div className="text-xl text-slate-300">Recording attendance...</div>
            </div>
        );
    }

    if (step === 'success' && identifiedStaff) {
        const isCheckIn = actionType === 'check_in';
        const bgClass = isCheckIn ? 'bg-green-950' : 'bg-blue-950';
        const shiftEnd = outletSettings?.closingTime ?? '21:00';

        return (
            <div className={cn('fixed inset-0 text-white z-50 flex flex-col items-center justify-center gap-6', bgClass)}>
                <CheckCircle2
                    className={cn('w-32 h-32', isCheckIn ? 'text-green-400' : 'text-blue-400')}
                    style={{ animation: 'scaleIn 0.4s ease-out' }}
                />
                <div className="text-5xl font-bold text-white mt-2">
                    {isCheckIn ? 'Checked In!' : 'Checked Out!'}
                </div>
                <div className="text-2xl text-white/80">{identifiedStaff.name}</div>
                <div className="text-4xl font-mono font-bold text-white mt-2">
                    {format(new Date(), 'hh:mm a')}
                </div>

                {isCheckIn && (
                    <div className="text-lg text-white/70">
                        Shift ends at {shiftEnd}
                    </div>
                )}

                {!isCheckIn && currentRecord?.workingHours !== undefined && (
                    <div className="text-xl text-white/70">
                        Worked: {currentRecord.workingHours}h today
                    </div>
                )}

                {currentRecord?.isLate && isCheckIn && (
                    <div className="flex items-center gap-2 bg-amber-800/50 rounded-xl px-6 py-3">
                        <Clock className="w-5 h-5 text-amber-300" />
                        <span className="text-amber-300">
                            Arrived {currentRecord.lateByMinutes} min late
                        </span>
                    </div>
                )}

                <div className="text-sm text-white/40 mt-4">
                    Returning to home in {autoResetTimer}s
                </div>
            </div>
        );
    }

    if (step === 'error') {
        return (
            <div className="fixed inset-0 bg-slate-900 text-white z-50 flex flex-col items-center justify-center gap-6">
                <XCircle className="w-24 h-24 text-red-400" />
                <div className="text-2xl text-white">{errorMessage}</div>
                <div className="text-sm text-white/40">
                    Returning to home in {autoResetTimer}s
                </div>
                <div className="flex gap-4">
                    <Button
                        variant="outline"
                        onClick={() => { setStep('pin_entry'); setEnteredPin(''); setErrorMessage(null); }}
                        className="border-slate-600 text-white hover:bg-slate-800"
                    >
                        Try Again
                    </Button>
                    <Button
                        variant="outline"
                        onClick={resetToIdle}
                        className="border-slate-600 text-white hover:bg-slate-800"
                    >
                        Return Home
                    </Button>
                </div>
            </div>
        );
    }

    return null;
}
