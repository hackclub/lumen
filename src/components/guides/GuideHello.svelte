<script lang="ts">
  export let label = 'Guide widget';

  let clicks = 0;

  const handleClick = () => {
    clicks += 1;
  };
</script>

<div class="guide-widget">
  <p>{label}</p>
  <button type="button" on:click={handleClick}>
    Clicked {clicks} {clicks === 1 ? 'time' : 'times'}
  </button>
</div>

<style>
  .guide-widget {
    display: grid;
    gap: 0.75rem;
    margin: 1.5rem 0;
    padding: 1rem;
    border: 1px solid var(--sl-color-gray-5);
    border-radius: 0.75rem;
    background: linear-gradient(135deg, rgba(233, 91, 95, 0.12), rgba(87, 29, 70, 0.18));
  }

  p {
    margin: 0;
    color: var(--sl-color-white);
    font-weight: 600;
  }

  button {
    width: fit-content;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--sl-color-accent);
    border-radius: 999px;
    background: var(--sl-color-black);
    color: var(--sl-color-white);
    cursor: pointer;
    transition: transform 120ms ease, border-color 120ms ease;
  }

  button:hover {
    transform: translateY(-1px);
    border-color: var(--sl-color-accent-high);
  }
</style>
