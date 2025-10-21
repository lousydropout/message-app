# Project Brief: React Native + Firebase Notetaking App

## Project Overview

A cross-platform mobile notetaking application built with React Native, Firebase, and Expo Go. This is a learning project designed to demonstrate production-ready development practices while building a functional notetaking app.

## Core Requirements

- **Platform**: React Native with Expo Go for development
- **Backend**: Firebase (Firestore + Authentication)
- **State Management**: Zustand (not React Context)
- **Navigation**: Expo Router (file-based routing)
- **Authentication**: Anonymous authentication initially
- **Data**: CRUD operations for notes with real-time synchronization
- **Offline Support**: SQLite integration planned for later phase

## Key Goals

1. **Learning Focus**: Understand React Native, Firebase, and Expo ecosystem
2. **Production Practices**: Implement proper error handling, security, and data integrity
3. **Testing Strategy**: Manual testing component approach (Jest setup encountered issues)
4. **Scalability**: Architecture that supports future enhancements

## Success Criteria

- [x] Firebase project setup with secure rules
- [x] Anonymous authentication working
- [x] CRUD operations for notes
- [x] Real-time synchronization
- [x] Basic UI with navigation
- [ ] Offline capabilities (SQLite integration)
- [ ] Enhanced features (search, categories, tags)

## Project Scope

**Phase 1 (Current)**: Firebase-only implementation with basic CRUD
**Phase 2 (Future)**: SQLite integration for offline-first architecture
**Phase 3 (Future)**: Enhanced features and production deployment

## Technical Constraints

- Must work with Expo Go (no custom native builds)
- Firebase Web SDK required for Expo compatibility
- TypeScript for type safety
- Production-level security rules
- Stable dependency versions (avoid canary releases)
