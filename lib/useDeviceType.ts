"use client";

/**
 * useDeviceType - Client-side hook to detect the user's platform.
 *
 * Parses navigator.userAgent to determine if the visitor is on
 * an Android device, iOS device, or desktop/other. Used to conditionally
 * render platform-specific download buttons (Google Play vs App Store).
 *
 * Returns { isAndroid, isIOS, isMobile } - all false during SSR.
 */

import { useState, useEffect } from "react";

interface DeviceType {
  /** True if the user agent indicates an Android device. */
  isAndroid: boolean;
  /** True if the user agent indicates an iOS device (iPhone, iPad, iPod). */
  isIOS: boolean;
  /** True if either isAndroid or isIOS is true. */
  isMobile: boolean;
}

export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>({
    isAndroid: false,
    isIOS: false,
    isMobile: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent || "";

    // Detect Android via user agent string
    const isAndroid = /android/i.test(ua);

    // Detect iOS via user agent or platform (covers iPhone, iPad, iPod).
    // iPad on iOS 13+ reports as "MacIntel" with touch support, so we check both.
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    setDevice({
      isAndroid,
      isIOS,
      isMobile: isAndroid || isIOS,
    });
  }, []);

  return device;
}
