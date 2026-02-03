window.__FC_INIT__ = {
    raised: {{ (funds_raised or 0)|round(0) }},
    goal:   {{ (fundraising_goal or 0)|round(0) }}
  };
