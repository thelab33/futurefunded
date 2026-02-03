try {
    import(
      "{{ url_for('static', filename='starforge/enable-brand-spine.js') if url_for is defined else '/static/starforge/enable-brand-spine.js' }}"
    ).catch(() => {});
  } catch (_) {}
