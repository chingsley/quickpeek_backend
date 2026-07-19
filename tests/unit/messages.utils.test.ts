import {
  buildAcceptanceBriefingTexts,
} from '../../src/common/utils/messages.utils';

describe('buildAcceptanceBriefingTexts', () => {
  it('returns location, detail, and acceptance criteria in order', () => {
    const texts = buildAcceptanceBriefingTexts({
      address: '296 Herring Cove Rd, Halifax, NS',
      latitude: 44.61,
      longitude: -63.62,
      detail: 'Need current queue length.',
      acceptanceCriteria: 'Photo proof of the queue.',
    });

    expect(texts).toEqual([
      'Location: 296 Herring Cove Rd, Halifax, NS',
      'Need current queue length.',
      'Acceptance criteria: Photo proof of the queue.',
    ]);
  });

  it('uses coordinates when address is missing', () => {
    const texts = buildAcceptanceBriefingTexts({
      address: null,
      latitude: 44.6126,
      longitude: -63.6192,
      detail: 'Detail only.',
      acceptanceCriteria: 'Criteria only.',
    });

    expect(texts[0]).toBe('Location: 44.6126, -63.6192');
  });

  it('omits location when no address or coordinates', () => {
    const texts = buildAcceptanceBriefingTexts({
      address: null,
      latitude: null,
      longitude: null,
      detail: 'Detail only.',
      acceptanceCriteria: 'Criteria only.',
    });

    expect(texts).toEqual(['Detail only.', 'Acceptance criteria: Criteria only.']);
  });
});
