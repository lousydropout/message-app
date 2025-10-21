# Project Brief: MessageAI - AI-Powered Messaging App

## Project Overview

A cross-platform mobile messaging application built with React Native, Firebase, and AI integration. This project pivots from a notetaking app to a real-time messaging platform with advanced AI features targeting a specific persona. Goal: Achieve 70-80 points on the MessageAI Rubric.

## Core Requirements

- **Platform**: React Native with Expo Go for development
- **Backend**: Firebase (Firestore + Authentication + Cloud Functions)
- **Real-time**: WebSocket connections for instant messaging
- **AI Integration**: OpenAI API with function calling and RAG
- **State Management**: Zustand for complex state
- **Navigation**: Expo Router (file-based routing)
- **Authentication**: Firebase Auth with Google social login and user profiles
- **Offline Support**: SQLite for message history + AsyncStorage for preferences
- **Mobile Lifecycle**: Proper background/foreground handling

## Key Goals

1. **Real-time Messaging**: Sub-200ms message delivery with WebSocket
2. **AI Features**: 5 required AI features for chosen persona
3. **Offline Support**: Queue messages locally, sync when online
4. **Group Chat**: Multi-user conversations with read receipts
5. **Mobile Quality**: Proper lifecycle handling and performance

## Success Criteria (70-80 Points)

### Core Messaging Infrastructure (35 points)

- [ ] Real-time message delivery <200ms
- [ ] Offline queuing and sync
- [ ] Group chat with 3+ users
- [ ] Read receipts and typing indicators

### Mobile App Quality (20 points)

- [ ] Proper background/foreground handling
- [ ] <2s app launch, 60 FPS scrolling
- [ ] Optimistic UI updates
- [ ] Professional layout and transitions

### Technical Implementation (10 points)

- [ ] Clean architecture with secured API keys
- [ ] Function calling/tool use implemented
- [ ] RAG pipeline for conversation context
- [ ] Rate limiting and response streaming

### Documentation & Deployment (5 points)

- [ ] Comprehensive README and setup
- [ ] Demo video (5-7 minutes)
- [ ] Persona Brainlift document
- [ ] Social post with @GauntletAI

### AI Features Implementation (30 points)

- [ ] 5 required AI features for persona
- [ ] Advanced AI capability (Multi-Step Agent/Proactive Assistant)
- [ ] Natural language commands 90%+ accuracy
- [ ] <2s response times for simple commands

## Project Scope

**Phase 1 (Immediate)**: Core messaging infrastructure and mobile app quality
**Phase 2**: Technical implementation and documentation
**Phase 3**: AI features implementation and advanced capabilities

## Technical Constraints

- Must work with Expo Go (no custom native builds)
- Firebase Web SDK required for Expo compatibility
- TypeScript for type safety
- API keys secured (never exposed in mobile app)
- Stable dependency versions (avoid canary releases)
- Real device testing required for demo video
- **Privacy**: User data protection important, but encryption out-of-scope
