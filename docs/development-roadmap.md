# DFtracker Development Roadmap

Last updated: 2026-03-16

This note captures the main API-driven improvements we want to build locally before deciding what is ready to publish.

## 1. Historical Player Stats

Status: Deferred locally

Use `GetPlayerOperationHistoricalStats` to turn the player page into a trend dashboard, not just a latest snapshot.

Planned outcomes:
- Trend chart for K/D, extraction rate, ranked points, kills, matches, and extracted assets
- Support season and ranked filters in the historical query
- Range controls such as 7D, 30D, and 90D

Note:
- The first local implementation was tested, but the UI section has been removed for now while we refocus the player page.

## 2. Reference Price Overlay

Status: In progress

Use `GetAuctionItemReferencePriceSeries` to compare actual market behavior against the reference baseline.

Planned outcomes:
- Overlay actual price vs reference price in one chart
- Show premium / discount percentage
- Surface fair value signals for bargain or overpriced items

## 3. Player Search by Name

Status: Implemented locally

Expand `GetPlayer` usage so search can accept player names, not just Delta Force ID or UUID.

Planned outcomes:
- Search by nickname
- Fallback lookup when the user does not know the numeric ID
- Better onboarding for casual users

## 4. Richer Market Sorting and Filtering

Status: In progress

Use the documented `filter` and `orderBy` capabilities in `ListAuctionItems` more aggressively.

Planned outcomes:
- Add smarter market discovery views without overloading the main search flow
- Filter by price ranges or newly added items when the live API behavior is reliable
- Surface stronger market insights directly from the current list and detail experience

## 5. Localization and Content Detail Pages

Status: In progress

Use API language support to improve presentation quality across the current Player, Market, and informational pages.

Planned outcomes:
- Support `LANGUAGE_ID` for a more natural Indonesian UI
- Add a persistent `Indonesia / English` language switch for the current UI shell
- Make API requests follow the active language automatically when supported
- Improve wording consistency between Indonesian and English terms
- Improve SEO and richer content pages around the currently active sections
