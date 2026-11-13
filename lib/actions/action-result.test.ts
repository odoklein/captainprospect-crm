import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACTION_RESULT_VALUES,
    ActionValidationError,
    normalizeActionResultCode,
    resolveActionResult,
} from './action-result';

test('every ActionResult enum value resolves to itself', () => {
    for (const code of ACTION_RESULT_VALUES) {
        assert.equal(resolveActionResult(code), code);
    }
});

test('PAS_INTÉRESSÉ resolves to NOT_INTERESTED', () => {
    assert.equal(resolveActionResult('PAS_INTÉRESSÉ'), 'NOT_INTERESTED');
    assert.equal(resolveActionResult('pas intéressé'), 'NOT_INTERESTED');
    assert.equal(resolveActionResult('Pas Intéressé'), 'NOT_INTERESTED');
    assert.equal(resolveActionResult('PAS INTERESSE'), 'NOT_INTERESTED');
});

test('PAS_INTÉRESSÉ resolves with its configured status definition', () => {
    const status = { code: 'PAS_INTÉRESSÉ', label: 'Pas intéressé' };
    assert.equal(resolveActionResult('PAS_INTÉRESSÉ', status), 'NOT_INTERESTED');
});

test('a custom code resolves through its configured label', () => {
    const custom = { code: 'PAS_INTÉRESSÉ_2', label: 'Pas intéressé' };
    assert.equal(resolveActionResult('PAS_INTÉRESSÉ_2', custom), 'NOT_INTERESTED');
});

test('standard mission statuses resolve', () => {
    const statuses = [
        { code: 'NO_RESPONSE', label: 'NRP' },
        { code: 'MEETING_BOOKED', label: 'RDV' },
        { code: 'BAD_CONTACT', label: 'FAUX NUMERO' },
        { code: 'BARRAGE_STANDARD', label: 'Barrage standard' },
        { code: 'NUMERO_KO', label: 'NUMERO KO' },
        { code: 'DISQUALIFIED', label: 'REFUS' },
        { code: 'MAIL_DOC', label: 'MAIL DOC' },
        { code: 'RAPPEL', label: 'RAPPEL' },
        { code: 'INVALIDE', label: 'INVALIDE' },
    ];
    for (const status of statuses) {
        assert.equal(resolveActionResult(status.code, status), status.code);
    }
});

test('legacy aliases resolve', () => {
    assert.equal(resolveActionResult('NRP'), 'NO_RESPONSE');
    assert.equal(resolveActionResult('MAUVAIS_CONTACT'), 'BAD_CONTACT');
    assert.equal(resolveActionResult('RAPPEL_DEMANDE'), 'CALLBACK_REQUESTED');
    assert.equal(resolveActionResult('RDV_PRIS'), 'MEETING_BOOKED');
    assert.equal(resolveActionResult('NON_INTERESSE'), 'NOT_INTERESTED');
});

test('unknown values throw a typed 400 error and preserve the input', () => {
    assert.throws(
        () => resolveActionResult('STATUT_INVENTE'),
        (error: unknown) => {
            assert.ok(error instanceof ActionValidationError);
            assert.equal(error.status, 400);
            assert.equal(error.message, 'Invalid action result: STATUT_INVENTE');
            return true;
        }
    );
});

test('empty and whitespace values throw', () => {
    for (const value of ['', '   ', '---']) {
        assert.throws(() => resolveActionResult(value), ActionValidationError);
    }
});

test('an unmappable custom status still throws instead of guessing', () => {
    assert.throws(
        () => resolveActionResult('TRUC_MAISON', { code: 'TRUC_MAISON', label: 'Truc maison' }),
        ActionValidationError
    );
});

test('normalization removes accents and separators', () => {
    assert.equal(normalizeActionResultCode('Pas intéressé'), 'PAS_INTERESSE');
    assert.equal(normalizeActionResultCode('  pas--intéressé  '), 'PAS_INTERESSE');
});
