import { useEffect, useState } from 'react';
import { getDb } from '../data/db';
import { syncShelters, type SyncResult } from '../data/syncShelters';
import { countShelters } from '../data/shelterRepository';

/**
 * 데이터 부트스트랩.
 *
 * 매니페스트 응답을 기다렸다가 화면을 그리면 네트워크가 느릴 때 앱이 멈춘 것처럼
 * 보인다. 그래서 DB가 열리는 즉시 ready로 전환해 로컬 데이터로 렌더링하고,
 * 동기화는 백그라운드에서 돌린 뒤 끝나면 revision을 올려 재조회를 유도한다.
 */
export function useShelterData() {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [count, setCount] = useState(0);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await getDb();
      if (cancelled) return;

      setCount(await countShelters());
      setReady(true); // 로컬 데이터로 먼저 그린다

      const result = await syncShelters();
      if (cancelled) return;

      setSyncResult(result);
      if (result.status === 'updated' || result.status === 'seeded-mock') {
        setCount(await countShelters());
        setRevision((r) => r + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, revision, count, syncResult };
}
