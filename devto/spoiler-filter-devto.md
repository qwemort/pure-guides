---
title: I built a spoiler filter for YouTube, Reddit and X that never sends your feed anywhere
published: false
description: How a browser extension can blur spoilers using only text matching inside the page, what that costs in performance, and what it honestly cannot catch.
tags: javascript, webdev, privacy, browser
canonical_url: https://qwemort.github.io/pure-guides/avoid-gta-6-spoilers.html
---

GTA 6 comes out on November 19 on consoles, with no PC version announced. A lot of people are about to spend a year dodging the ending in thumbnails, post titles and top comments. YouTube and Reddit have no "mute words" feature, so I built a browser extension that blurs spoilers for the titles you pick. Disclosure: it's mine, and it has a paid tier. This post is about how it works, not a sales pitch. The source is public if you want to check: https://github.com/qwemort/pure-spoiler-shield

## The constraint: nothing leaves the browser

The easy way to build this would be to send page text or screenshots to a server with a model on it. I didn't want that. A spoiler filter sees everything you browse, so the only acceptable design for me was: everything runs in the content script, no analytics, no remote config. The only network request in the whole extension is an optional license check to Gumroad when someone enters a Pro key. You can grep for `fetch(` and find exactly one.

That decision shapes everything else: no image recognition, no "smart" model, just text and some care.

## How a card gets judged

For each title you protect there are a few word sets:

- **Title names**: "GTA 6", "GTA VI", "ГТА 6" and so on, in several languages.
- **Unique names**: words that only mean this title (a place or a full character name from the trailers).
- **Common names**: first names like "Jason" or "Lucia" that also appear in unrelated posts. These only count when the page or card is already about the title.
- **Spoiler words**: "ending", "dies", "finale", "leak", "who dies" and their equivalents in 13 languages.

In "spoilers only" mode a card is covered when it mentions the title (or a unique name, or a common name with context) **and** a spoiler word. In "everything" mode any mention is enough. Before matching, text is normalized (case, diacritics, separators), and phrases like "no spoilers" or "ending theme" are cut out first, because they are the most common false positives.

## Finding the cards

Each site gets a small adapter that knows what a "card" is: a video tile, a Short, a comment, a search suggestion, a post, a trend. New content arrives through infinite scroll, so a `MutationObserver` watches for added nodes and only the new ones get judged. The site header, logo, menu and search box are never covered, and a container that holds two or more cards is never covered as a whole, so one bad match can't blank the page.

## Blurring without breaking the site

The site's DOM is not rewritten. A covered card just gets a class, and the blur is a `::after` layer with `backdrop-filter: blur(18px)`. That means the original element stays intact, events and layout keep working, and removing the class restores everything. Opening a covered item takes two clicks: the first asks "are you sure". Hover does nothing, so you can't reveal something by moving the mouse.

## What it costs

On a test page with 2,000 feed cards, a full pass took about 410 ms with the extension versus about 377 ms without it, and around 360 ms in a later run with 21 shields active (run-to-run noise is real at this scale). That's a local measurement on my machine, not a benchmark, but it was enough to stop worrying about it.

## What it cannot do

- A spoiler that exists only inside an image or a video frame is invisible to a text filter. Fixing that properly would mean running a model on the images, and doing that locally in a browser extension is a project of its own.
- Sites change their markup. When YouTube renames a component, some cards slip through until the adapter is updated.
- It only knows words you gave it or that ship in the lists. Brand-new character names from the finished game are unknowable in advance; that's what the "everything" mode and custom words are for.

## Try it, break it

Chrome: https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng?utm_source=devto (Firefox is in review). If you find a false positive or a card type it misses, an issue with the page and the text is the most useful thing you can send me.
