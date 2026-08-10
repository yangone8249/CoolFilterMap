import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  NaverMapView,
  type Camera,
  type Region,
} from '@mj-studio/react-native-naver-map';

import { CLUSTER, INITIAL_CAMERA, SEARCH } from '../config';
import { countInBounds, findInBounds } from '../data/shelterRepository';
import { boundsFromRegion, formatDistance, haversine } from '../geo/distance';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useShelterData } from '../hooks/useShelterData';
import { openDirections } from '../lib/directions';
import { CATEGORY_FILTERS, categoryLabel } from '../lib/categories';
import type { Shelter, ShelterCategory } from '../types';

export function MapScreen() {
  const { ready, revision, count, syncResult } = useShelterData();
  const { location, permission } = useCurrentLocation();

  const [visible, setVisible] = useState<Shelter[]>([]);
  /** 화면 범위 안의 실제 쉼터 수. visible.length는 상한에 잘리므로 따로 센다. */
  const [totalInView, setTotalInView] = useState(0);
  const [camera, setCamera] = useState<{ region: Region; zoom: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<Shelter | null>(null);
  /** null이면 전체 보기. 경로당이 71.7%라 필터가 없으면 나머지가 묻힌다. */
  const [category, setCategory] = useState<ShelterCategory | null>(null);

  // 카메라가 멈췄을 때만 발생하므로 별도 debounce가 필요 없다.
  const handleCameraIdle = useCallback(
    (params: Camera & { region: Region }) =>
      setCamera({ region: params.region, zoom: params.zoom ?? 0 }),
    [],
  );

  const markersHidden = totalInView > SEARCH.maxMarkers;

  // 화면에 보이는 영역만 SQL로 조회한다. 전체를 메모리에 올리지 않는다.
  useEffect(() => {
    if (!ready || !camera) return;

    let cancelled = false;
    const bounds = boundsFromRegion(camera.region);

    (async () => {
      // 먼저 진짜 개수를 센다. 마커를 안 그릴 때도 몇 곳인지는 알려준다.
      const total = await countInBounds(bounds, category);
      if (cancelled) return;
      setTotalInView(total);

      // 다 못 그릴 양이면 일부만 그리는 대신 확대를 유도한다.
      if (total > SEARCH.maxMarkers) {
        setVisible([]);
        setSelected(null);
        return;
      }

      const rows = await findInBounds(bounds, SEARCH.maxMarkers, category);
      if (!cancelled) setVisible(rows);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, camera, revision, category]);

  // 마커 수백 개를 낱개로 그리면 저사양 기기에서 프레임이 무너진다.
  // 네이티브 클러스터링에 맡기고, 탭된 leaf만 id로 되짚는다.
  const clusters = useMemo(
    () => [
      {
        markers: visible.map((s) => ({
          identifier: s.id,
          latitude: s.lat,
          longitude: s.lng,
        })),
        screenDistance: CLUSTER.screenDistance,
        maxZoom: CLUSTER.maxZoom,
      },
    ],
    [visible],
  );

  const byId = useMemo(
    () => new Map(visible.map((s) => [s.id, s])),
    [visible],
  );

  const handleTapLeaf = useCallback(
    ({ markerIdentifier }: { markerIdentifier: string }) =>
      setSelected(byId.get(markerIdentifier) ?? null),
    [byId],
  );

  const handleDirections = useCallback(async () => {
    if (!selected) return;
    const opened = await openDirections(selected);
    if (!opened) {
      Alert.alert('길찾기를 열 수 없습니다', '지도 앱을 실행하지 못했습니다.');
    }
  }, [selected]);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const distance =
    selected && location ? haversine(location, selected) : null;

  // 배지는 항상 진짜 개수를 말한다. 마커 수를 세어 보여주면 상한에 잘렸을 때
  // 거짓말이 된다.
  const statusText = markersHidden
    ? `이 영역에 ${totalInView.toLocaleString()}곳 · 확대해서 보기`
    : `보이는 쉼터 ${totalInView.toLocaleString()} / 전체 ${count.toLocaleString()}`;

  return (
    <View style={styles.container}>
      <NaverMapView
        style={StyleSheet.absoluteFill}
        initialCamera={
          location
            ? { latitude: location.lat, longitude: location.lng, zoom: 15 }
            : INITIAL_CAMERA
        }
        isShowLocationButton={permission === 'granted'}
        onCameraIdle={handleCameraIdle}
        onTapMap={() => setSelected(null)}
        onTapClusterLeaf={handleTapLeaf}
        clusters={clusters}
      />

      <View style={styles.topBar}>
        <View style={styles.statusBar} pointerEvents="none">
          <Text style={styles.statusText}>
            {statusText}
            {syncResult?.status === 'seeded-mock' ? ' · 목 데이터' : ''}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <CategoryChip
            label="전체"
            active={category === null}
            onPress={() => setCategory(null)}
          />
          {CATEGORY_FILTERS.map(({ key, label }) => (
            <CategoryChip
              key={key}
              label={label}
              active={category === key}
              onPress={() => setCategory(category === key ? null : key)}
            />
          ))}
        </ScrollView>
      </View>

      {selected && (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{selected.name}</Text>
          <Text style={styles.sheetBody}>{selected.address}</Text>
          <Text style={styles.sheetMeta}>
            {[
              categoryLabel(selected.category),
              selected.capacity ? `최대 ${selected.capacity}명` : null,
              distance != null ? formatDistance(distance) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          <Pressable
            style={styles.button}
            onPress={handleDirections}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>길찾기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 56, left: 0, right: 0, gap: 8 },
  statusBar: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: { color: '#fff', fontSize: 12 },
  chipRow: { paddingHorizontal: 12, gap: 6 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  chipActive: { backgroundColor: '#0068c3' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  sheetTitle: { fontSize: 17, fontWeight: '600' },
  sheetBody: { fontSize: 14, color: '#444' },
  sheetMeta: { fontSize: 13, color: '#777' },
  button: {
    marginTop: 12,
    backgroundColor: '#0068c3',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
