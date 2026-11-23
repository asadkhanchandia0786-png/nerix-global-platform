// Validates provider token counters sent by the gateway. Throws Error('invalid_voice_usage').
export function normalizeRealtimeUsage(value) {
  const bad = () => new Error('invalid_voice_usage');
  if (!value || typeof value !== 'object') throw bad();
  const integer = n => { if (n === undefined) return 0; if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) throw bad(); return n; };
  const input = value.input_token_details || {}, cached = input.cached_tokens_details || {}, output = value.output_token_details || {};
  return { total_tokens: integer(value.total_tokens), input_tokens: integer(value.input_tokens), output_tokens: integer(value.output_tokens),
    input_token_details: { text_tokens: integer(input.text_tokens), audio_tokens: integer(input.audio_tokens), image_tokens: integer(input.image_tokens),
      cached_tokens: integer(input.cached_tokens), cached_tokens_details: { text_tokens: integer(cached.text_tokens), audio_tokens: integer(cached.audio_tokens), image_tokens: integer(cached.image_tokens) } },
    output_token_details: { text_tokens: integer(output.text_tokens), audio_tokens: integer(output.audio_tokens) } };
}
