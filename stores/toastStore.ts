/**
 * @fileoverview Toast Store (Zustand) - Manages temporary, non-blocking notifications.
 *
 * This store provides a centralized system for managing and displaying toast
 * notifications, which are small, non-intrusive messages that appear temporarily
 * on the screen to provide feedback or information to the user. It handles the
 * creation, queuing, and automatic dismissal of these notifications.
 *
 * The store is designed to be simple and flexible, supporting different types
 * of toasts for various application events, such as receiving a new message or
 * a friend request.
 *
 * @see Toast component for the UI that renders the notifications from this store.
 * @see contactsStore and messagesStore for examples of how toasts are triggered.
 */

/**
 * @fileoverview Toast Store - Manages toast notifications
 *
 * This store handles:
 * - Toast notifications for various events
 * - Auto-dismissal after 5 seconds
 * - Multiple toast types (messages, friend requests, etc.)
 * - Toast queue management
 *
 * Toast types:
 * - message: New message received
 * - friend_request: Friend request received
 * - friend_accepted: Friend request accepted
 */

import { create } from "zustand";

/**
 * Toast notification interface
 */
export interface Toast {
  /** Unique toast ID */
  id: string;
  /** Type of toast notification */
  type: "message" | "friend_request" | "friend_accepted";
  /** Toast title */
  title: string;
  /** Toast message content */
  message: string;
  /** Timestamp when toast was created */
  timestamp: number;
  /** Optional conversation ID (for message toasts) */
  conversationId?: string;
  /** Optional sender ID (for message/friend toasts) */
  senderId?: string;
  /** Optional sender name (for message/friend toasts) */
  senderName?: string;
}

/**
 * Toast store state interface
 */
export interface ToastState {
  /** Array of active toasts */
  toasts: Toast[];
  /** Add a new toast notification */
  addToast: (toast: Omit<Toast, "id" | "timestamp">) => void;
  /** Remove a toast by ID */
  removeToast: (id: string) => void;
  /** Clear all toasts */
  clearAllToasts: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  /**
   * Add a new toast notification
   *
   * Creates a toast with unique ID and timestamp, adds it to the queue,
   * and automatically removes it after 5 seconds.
   *
   * @param toastData - Toast data (id and timestamp are auto-generated)
   */
  addToast: (toastData) => {
    const toast: Toast = {
      ...toastData,
      id: `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      get().removeToast(toast.id);
    }, 5000);
  },

  /**
   * Removes a toast notification from the list by its unique ID.
   *
   * @param id The ID of the toast to remove.
   */
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  /**
   * Clears all currently displayed toast notifications.
   */
  clearAllToasts: () => {
    set({ toasts: [] });
  },
}));
