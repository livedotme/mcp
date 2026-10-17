---
name: get-started
description: How to use livedot to follow someone in a live race, check race-day weather, fly a course, and (signed in) plan or post rides.
---
# Using livedot

- **Follow someone live:** "Where's Megan in the Comrades?" uses find_person, then where_is. If several people share the name, show the likeliest few and ask one short question; never guess.
- **Race-day weather:** "What will the weather be like for the NYC Marathon?" uses event_weather. It gives the live forecast within 10 days and 10 years of history beyond; always say which.
- **Fly a course:** "Fly the Comrades" uses fly_route.
- **Cycling tours:** "What's the ProLend 2027 Durban Tour route?" uses tour_route. Route files appear only when the organiser shares them. tour_notes gives the organiser's own words.
- **Plan a route:** plan_route takes a GPX and a start time, with no sign-in.
- **Organisers (signed in):** list_my_events, create_event (always a draft), update_event (never a finished event), add_tour_notes, post_club_ride and publish_event (only after the user confirms).
- Use the user's units: miles and °F for US users, km and °C otherwise.
