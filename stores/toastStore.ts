import { create } from "zustand";

export interface Toast {
  id: string;
  type: "message" | "friend_request" | "friend_accepted";
  title: string;
  message: string;
  timestamp: number;
  conversationId?: string; // For message toasts
  senderId?: string; // For message/friend toasts
  senderName?: string; // For message/friend toasts
}

export interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "timestamp">) => void;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

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

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearAllToasts: () => {
    set({ toasts: [] });
  },
}));
