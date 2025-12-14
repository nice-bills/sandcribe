# Dune SQL Logger

Automated SQL telemetry for Dune Analytics to build real-world fine-tuning datasets.

## Overview
A browser extension that silently captures Dune Analytics SQL execution history. It records queries, errors, and auto-detected fixes to create a high-quality, ground-truth dataset for training LLMs on Dune SQL.

## Features (Planned)
- Intercept GraphQL and Execution requests
- Auto-detect error->fix patterns
- Store query history locally
- Silent sync to private backend
- Export data to CSV

## Setup
1. Clone this repository.
2. Load the `extension` folder as an unpacked extension in Chrome/Edge.
